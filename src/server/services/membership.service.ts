import { MembershipStatus, type Currency, type MembershipTier, type RenewalUnit } from '@prisma/client';
import type { Db } from '@/lib/prisma';
import { prisma } from '@/lib/prisma';
import { addPeriod, addDays, today, toDateOnly } from '@/lib/dates';
import { isPositive, percentOf, toDecimal, toStorage } from '@/lib/money';
import { nextMembershipNumber } from './reference.service';

/**
 * Membership — PRD section 5.
 *
 * Only the technical layer: the number, the subscription period, and the
 * benefits that get applied at booking time. Card design and physical printing
 * are outside Newmux's scope.
 */

export type MembershipBenefit = {
  membershipId: string;
  membershipNumber: string;
  tier: MembershipTier;
  discountPercent: string;
  groupBookingPriority: boolean;
};

/**
 * Issue a membership to a customer.
 *
 * The number comes from a sequence inside the same transaction as the insert,
 * so two staff enrolling members simultaneously cannot collide.
 */
export async function issueMembership(
  db: Db,
  input: {
    customerId: string;
    tier?: MembershipTier;
    startDate?: Date;
    expiryDate?: Date;
    renewalUnit?: RenewalUnit;
    renewalValue?: number;
    discountPercent?: string | number;
    groupBookingPriority?: boolean;
    notes?: string | null;
  },
) {
  const start = toDateOnly(input.startDate ?? new Date());
  const renewalUnit = input.renewalUnit ?? 'YEAR';
  const renewalValue = input.renewalValue ?? 1;
  const expiry = input.expiryDate
    ? toDateOnly(input.expiryDate)
    : addPeriod(start, renewalUnit, renewalValue);

  if (expiry.getTime() < start.getTime()) {
    throw new Error('Membership expiry date cannot be before its start date');
  }

  const membershipNumber = await nextMembershipNumber(db);

  return db.membership.create({
    data: {
      membershipNumber,
      customerId: input.customerId,
      tier: input.tier ?? 'VOYAGEUR',
      status: MembershipStatus.ACTIVE,
      startDate: start,
      expiryDate: expiry,
      renewalUnit,
      renewalValue,
      discountPercent: toStorage(input.discountPercent ?? 0),
      groupBookingPriority: input.groupBookingPriority ?? true,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Renew for another period.
 *
 * A renewal that starts before the current expiry extends from that expiry
 * rather than from today, so renewing early never costs the member days.
 */
export async function renewMembership(
  db: Db,
  input: {
    membershipId: string;
    amount: string | number;
    currency?: Currency;
    paymentId?: string | null;
    periodStart?: Date;
    periodEnd?: Date;
    renewalUnit?: RenewalUnit;
    renewalValue?: number;
  },
) {
  const membership = await db.membership.findUnique({ where: { id: input.membershipId } });
  if (!membership) throw new Error(`Membership ${input.membershipId} not found`);

  const now = today();
  const currentExpiry = toDateOnly(membership.expiryDate);
  const start = input.periodStart
    ? toDateOnly(input.periodStart)
    : currentExpiry.getTime() >= now.getTime()
      ? addDays(currentExpiry, 1)
      : now;
  const renewalUnit = input.renewalUnit ?? membership.renewalUnit;
  const renewalValue = input.renewalValue ?? membership.renewalValue;
  const end = input.periodEnd ? toDateOnly(input.periodEnd) : addPeriod(start, renewalUnit, renewalValue);

  await db.membershipRenewal.create({
    data: {
      membershipId: membership.id,
      periodStart: start,
      periodEnd: end,
      amount: toStorage(input.amount),
      currency: input.currency ?? 'BHD',
      paymentId: input.paymentId ?? null,
    },
  });

  return db.membership.update({
    where: { id: membership.id },
    data: {
      expiryDate: end,
      status: MembershipStatus.ACTIVE,
      renewalUnit,
      renewalValue,
    },
  });
}

/**
 * Mark memberships whose expiry has passed.
 *
 * Run by the cron route. Statuses are persisted rather than computed on read so
 * that lists can filter on them in SQL, but `activeBenefitFor` below never
 * trusts the flag alone.
 */
export async function expireLapsedMemberships(db: Db, now: Date = new Date()): Promise<number> {
  const result = await db.membership.updateMany({
    where: {
      status: MembershipStatus.ACTIVE,
      expiryDate: { lt: today(now) },
    },
    data: { status: MembershipStatus.EXPIRED },
  });
  return result.count;
}

/**
 * The benefit a customer is entitled to right now, or null.
 *
 * Both the status and the expiry date are checked, so a membership that lapsed
 * since the last cron run does not quietly keep discounting.
 */
export async function activeBenefitFor(
  db: Db,
  customerId: string,
  now: Date = new Date(),
): Promise<MembershipBenefit | null> {
  const membership = await db.membership.findUnique({
    where: { customerId },
    select: {
      id: true,
      membershipNumber: true,
      tier: true,
      status: true,
      startDate: true,
      expiryDate: true,
      discountPercent: true,
      groupBookingPriority: true,
    },
  });

  if (!membership) return null;
  if (membership.status !== MembershipStatus.ACTIVE) return null;

  const day = today(now);
  if (toDateOnly(membership.startDate).getTime() > day.getTime()) return null;
  if (toDateOnly(membership.expiryDate).getTime() < day.getTime()) return null;

  return {
    membershipId: membership.id,
    membershipNumber: membership.membershipNumber,
    tier: membership.tier,
    discountPercent: membership.discountPercent.toString(),
    groupBookingPriority: membership.groupBookingPriority,
  };
}

/**
 * The discount to snapshot onto a booking.
 *
 * Returns both the percentage and the resolved amount, because the booking
 * stores both: the percentage for the customer-facing explanation, the amount
 * so historical margin never shifts if the member's terms change later.
 */
/**
 * `overridePercent` is used for the family-member rate: a member still has
 * to exist and be active (this is a member benefit, not a public discount),
 * but the rate applied is the family percentage from Settings rather than
 * the member's own, when staff mark the booking as being for a family
 * member travelling with them (see Settings → Family Discount).
 */
export function resolveMembershipDiscount(
  sellingAmount: string | number,
  benefit: MembershipBenefit | null,
  overridePercent?: string | number | null,
) {
  if (!benefit) {
    return { percent: '0.00', amount: toStorage(0) };
  }

  const percent = toDecimal(overridePercent ?? benefit.discountPercent);
  if (!isPositive(percent)) {
    return { percent: '0.00', amount: toStorage(0) };
  }

  return {
    percent: percent.toFixed(2),
    amount: toStorage(percentOf(sellingAmount, percent)),
  };
}

/** Memberships expiring within `daysAhead`, for the renewal reminder. */
export async function membershipsDueForRenewal(
  db: Db,
  daysAhead: number,
  now: Date = new Date(),
) {
  const from = today(now);
  const to = addDays(from, daysAhead);

  return db.membership.findMany({
    where: {
      status: MembershipStatus.ACTIVE,
      expiryDate: { gte: from, lte: to },
    },
    include: {
      customer: {
        select: { id: true, fullName: true, phone: true, whatsappPhone: true },
      },
    },
    orderBy: { expiryDate: 'asc' },
  });
}

/** Lifetime value across a customer's non-cancelled bookings. Admin/accounting only. */
export async function customerLifetimeValue(customerId: string, db: Db = prisma) {
  const agg = await db.booking.aggregate({
    where: { customerId, status: { not: 'CANCELLED' } },
    _sum: { netSellingAmount: true, marginAmount: true },
    _count: true,
  });

  return {
    bookingCount: agg._count,
    totalSpend: toStorage(agg._sum.netSellingAmount ?? 0),
    totalMargin: toStorage(agg._sum.marginAmount ?? 0),
  };
}
