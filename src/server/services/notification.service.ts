import { NotificationEvent, NotificationStatus } from '@prisma/client';
import type { Db } from '@/lib/prisma';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/dates';
import { formatMoney, isPositive, subtract, toStorage } from '@/lib/money';

/**
 * Notification enqueueing — PRD section 6.
 *
 * Nothing is ever sent from a request handler. Domain events write a row to the
 * outbox and return; the cron dispatcher delivers it. That keeps a WhatsApp
 * outage from failing a booking, and makes delivery retryable.
 *
 * Every row carries a `dedupeKey` unique to (event, entity, occurrence). The
 * insert uses it to no-op on conflict, so re-running the dispatcher — or
 * confirming a booking twice — can never message a customer twice.
 */

export const TEMPLATE_KEYS = {
  BOOKING_CONFIRMED: 'booking_confirmed',
  BALANCE_DUE_REMINDER: 'balance_due_reminder',
  MEMBERSHIP_RENEWAL_REMINDER: 'membership_renewal_reminder',
  GROUP_CAPACITY_ALERT: 'group_capacity_alert',
  GROUP_ITINERARY_SHARE: 'group_itinerary_share',
} as const;

/**
 * Normalise a Bahraini number to E.164 digits, which is what wa.me and the
 * Cloud API both expect (no plus, no spaces, no dashes).
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  const hasPlus = digits.startsWith('+');
  digits = digits.replace(/\+/g, '');
  if (!digits) return null;

  // A bare local Bahraini mobile (8 digits, starting 3) gets the country code.
  if (!hasPlus && digits.length === 8 && /^[36]/.test(digits)) {
    digits = `973${digits}`;
  }

  return digits.length >= 8 ? digits : null;
}

/** The number to message a customer on: WhatsApp field first, then phone. */
export function whatsappNumberFor(customer: {
  phone: string;
  whatsappPhone?: string | null;
}): string | null {
  return normalisePhone(customer.whatsappPhone) ?? normalisePhone(customer.phone);
}

/** Substitute {{name}} placeholders in a template body. */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

/** A wa.me link that opens WhatsApp with the message pre-filled. */
export function waMeLink(toPhone: string, body: string): string {
  return `https://wa.me/${toPhone}?text=${encodeURIComponent(body)}`;
}

type EnqueueInput = {
  event: NotificationEvent;
  templateKey: string;
  dedupeKey: string;
  toPhone: string;
  variables: Record<string, string>;
  recipientType?: 'CUSTOMER' | 'STAFF';
  customerId?: string | null;
  bookingId?: string | null;
  membershipId?: string | null;
  departureId?: string | null;
  scheduleItemId?: string | null;
  scheduledFor?: Date;
};

/**
 * Write one outbox row, ignoring a duplicate dedupeKey.
 *
 * Returns the row when it was newly created, or null when an identical
 * notification already existed.
 */
export async function enqueue(db: Db, input: EnqueueInput) {
  const template = await db.notificationTemplate.findUnique({
    where: { key: input.templateKey },
  });

  if (!template || !template.isActive) {
    // A missing or disabled template is a configuration problem, not a reason
    // to fail the booking that triggered it.
    return null;
  }

  const existing = await db.notificationOutbox.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  });
  if (existing) return null;

  try {
    return await db.notificationOutbox.create({
      data: {
        event: input.event,
        templateKey: input.templateKey,
        dedupeKey: input.dedupeKey,
        recipientType: input.recipientType ?? 'CUSTOMER',
        toPhone: input.toPhone,
        variables: input.variables,
        renderedBodyEn: renderTemplate(template.bodyEn, input.variables),
        renderedBodyAr: template.bodyAr
          ? renderTemplate(template.bodyAr, input.variables)
          : null,
        customerId: input.customerId ?? null,
        bookingId: input.bookingId ?? null,
        membershipId: input.membershipId ?? null,
        departureId: input.departureId ?? null,
        scheduleItemId: input.scheduleItemId ?? null,
        scheduledFor: input.scheduledFor ?? new Date(),
        status: NotificationStatus.PENDING,
      },
    });
  } catch (error) {
    // Lost a race on the unique dedupeKey: the other writer queued it, so this
    // is success, not failure.
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/** Booking confirmation — sent when a booking reaches Confirmed. */
export async function enqueueBookingConfirmed(db: Db, bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { select: { id: true, fullName: true, phone: true, whatsappPhone: true } },
      scheduleItems: { orderBy: { dueDate: 'asc' } },
    },
  });
  if (!booking) return null;

  const toPhone = whatsappNumberFor(booking.customer);
  if (!toPhone) return null;

  const balanceItem = booking.scheduleItems.find(
    (item) => item.kind === 'BALANCE' && item.status !== 'PAID',
  );

  return enqueue(db, {
    event: NotificationEvent.BOOKING_CONFIRMED,
    templateKey: TEMPLATE_KEYS.BOOKING_CONFIRMED,
    // One confirmation per booking, however many times it is re-confirmed.
    dedupeKey: `booking_confirmed:${booking.id}`,
    toPhone,
    customerId: booking.customerId,
    bookingId: booking.id,
    variables: {
      customerName: booking.customer.fullName,
      reference: booking.reference,
      bookingType: humanBookingType(booking.type),
      travelDate: formatDate(booking.departureDate),
      total: formatMoney(booking.netSellingAmount.toString()),
      balanceDue: balanceItem
        ? formatMoney(subtract(balanceItem.amountDue, balanceItem.paidAmount).toString())
        : formatMoney(0),
      balanceDueDate: balanceItem ? formatDate(balanceItem.dueDate) : '—',
    },
  });
}

/** Balance reminder — sent ahead of a scheduled balance date. */
export async function enqueueBalanceReminder(db: Db, scheduleItemId: string) {
  const item = await db.paymentScheduleItem.findUnique({
    where: { id: scheduleItemId },
    include: {
      booking: {
        include: {
          customer: { select: { id: true, fullName: true, phone: true, whatsappPhone: true } },
        },
      },
    },
  });
  if (!item) return null;

  const toPhone = whatsappNumberFor(item.booking.customer);
  if (!toPhone) return null;

  const outstanding = subtract(item.amountDue, item.paidAmount);
  if (!isPositive(outstanding)) return null;

  return enqueue(db, {
    event: NotificationEvent.BALANCE_DUE_REMINDER,
    templateKey: TEMPLATE_KEYS.BALANCE_DUE_REMINDER,
    // Scoped to the due date, so rescheduling the balance legitimately allows
    // one further reminder, while re-running the job today does not.
    dedupeKey: `balance_due:${item.id}:${item.dueDate.toISOString().slice(0, 10)}`,
    toPhone,
    customerId: item.booking.customerId,
    bookingId: item.bookingId,
    scheduleItemId: item.id,
    variables: {
      customerName: item.booking.customer.fullName,
      reference: item.booking.reference,
      amount: formatMoney(toStorage(outstanding)),
      dueDate: formatDate(item.dueDate),
      travelDate: formatDate(item.booking.departureDate),
    },
  });
}

/**
 * Membership renewal reminder — sent ahead of expiry.
 *
 * Two independent stages (1 month out, then 1 week out) rather than one:
 * `stage` is folded into the dedupe key so the two do not collide — without
 * it, both calls resolve to the same (event, entity, occurrence) row and the
 * second stage would silently never send, since the first would already have
 * claimed that key.
 */
export async function enqueueMembershipRenewalReminder(
  db: Db,
  membershipId: string,
  stage: 'LONG' | 'SHORT' = 'LONG',
) {
  const membership = await db.membership.findUnique({
    where: { id: membershipId },
    include: {
      customer: { select: { id: true, fullName: true, phone: true, whatsappPhone: true } },
    },
  });
  if (!membership) return null;

  const toPhone = whatsappNumberFor(membership.customer);
  if (!toPhone) return null;

  return enqueue(db, {
    event: NotificationEvent.MEMBERSHIP_RENEWAL_REMINDER,
    templateKey: TEMPLATE_KEYS.MEMBERSHIP_RENEWAL_REMINDER,
    // Scoped to the expiry date and stage, so next year's reminder is a
    // distinct row and the two stages never collide with each other.
    dedupeKey: `membership_renewal:${membership.id}:${membership.expiryDate
      .toISOString()
      .slice(0, 10)}:${stage}`,
    toPhone,
    customerId: membership.customerId,
    membershipId: membership.id,
    variables: {
      customerName: membership.customer.fullName,
      membershipNumber: membership.membershipNumber,
      tier: membership.tier,
      expiryDate: formatDate(membership.expiryDate),
    },
  });
}

/**
 * Share the itinerary PDF with a traveler on a Group Adventure — staff
 * initiated, not scheduled, so the dedupe key is scoped to today rather than
 * a fixed occurrence: sending it again after an itinerary change is the
 * point, not a bug to guard against, but one click should not double-queue.
 */
export async function enqueueItineraryShare(
  db: Db,
  input: { departureId: string; customerId: string; toPhone: string; customerName: string; itineraryUrl: string },
) {
  const departure = await db.groupDeparture.findUnique({
    where: { id: input.departureId },
    select: { name: true, departureDate: true },
  });
  if (!departure) return null;

  return enqueue(db, {
    event: NotificationEvent.GROUP_ITINERARY_SHARE,
    templateKey: TEMPLATE_KEYS.GROUP_ITINERARY_SHARE,
    dedupeKey: `group_itinerary_share:${input.departureId}:${input.customerId}:${new Date()
      .toISOString()
      .slice(0, 10)}`,
    toPhone: input.toPhone,
    customerId: input.customerId,
    departureId: input.departureId,
    variables: {
      customerName: input.customerName,
      tripName: departure.name,
      departureDate: formatDate(departure.departureDate),
      itineraryUrl: input.itineraryUrl,
    },
  });
}

/**
 * Staff alert when a departure is filling up (PRD section 6).
 *
 * `lastCapacityAlertPercent` on the departure records the highest threshold
 * already announced, so staff get one alert at 80% and one at 100% rather than
 * one per seat sold.
 */
export async function enqueueCapacityAlertIfNeeded(db: Db, departureId: string) {
  const departure = await db.groupDeparture.findUnique({ where: { id: departureId } });
  if (!departure || departure.capacity <= 0) return null;

  const threshold = env().GROUP_CAPACITY_ALERT_THRESHOLD;
  const percent = Math.floor((departure.seatsBooked / departure.capacity) * 100);

  // Announce at the configured threshold, and again when the trip fills.
  const milestone = percent >= 100 ? 100 : percent >= threshold ? threshold : null;
  if (milestone === null || milestone <= departure.lastCapacityAlertPercent) return null;

  const staffNumbers = env().staffNumbers.map(normalisePhone).filter((n): n is string => !!n);
  if (staffNumbers.length === 0) {
    // Still record the milestone, so enabling staff numbers later does not
    // replay every alert the trip has ever passed.
    await db.groupDeparture.update({
      where: { id: departureId },
      data: { lastCapacityAlertPercent: milestone },
    });
    return null;
  }

  const variables = {
    tripName: departure.name,
    departureDate: formatDate(departure.departureDate),
    seatsBooked: String(departure.seatsBooked),
    capacity: String(departure.capacity),
    seatsRemaining: String(Math.max(0, departure.capacity - departure.seatsBooked)),
    percent: String(percent),
  };

  for (const toPhone of staffNumbers) {
    await enqueue(db, {
      event: NotificationEvent.GROUP_CAPACITY_ALERT,
      templateKey: TEMPLATE_KEYS.GROUP_CAPACITY_ALERT,
      dedupeKey: `group_capacity:${departure.id}:${milestone}:${toPhone}`,
      toPhone,
      recipientType: 'STAFF',
      departureId: departure.id,
      variables,
    });
  }

  await db.groupDeparture.update({
    where: { id: departureId },
    data: { lastCapacityAlertPercent: milestone },
  });

  return milestone;
}

function humanBookingType(type: string): string {
  return type
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
