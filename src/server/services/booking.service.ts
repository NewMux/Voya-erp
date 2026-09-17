import {
  BookingStatus,
  DepartureStatus,
  type BookingType,
  type Currency,
  type DepositType,
  type Prisma,
} from '@prisma/client';
import { prisma, type Db } from '@/lib/prisma';
import { inTransaction } from '@/lib/tx';
import {
  add,
  convertToBase,
  depositAmount,
  gt,
  isPositive,
  subtract,
  toDecimal,
  toStorage,
  type CurrencyCode,
} from '@/lib/money';
import { addDays, toDateOnly, today } from '@/lib/dates';
import { nextBookingReference } from './reference.service';
import { activeBenefitFor, resolveMembershipDiscount } from './membership.service';
import { recalcBookingPaymentStatus } from './payment.service';
import { enqueueBookingConfirmed, enqueueCapacityAlertIfNeeded } from './notification.service';

/** Raised when a Group Adventure departure cannot fit the requested seats. */
export class CapacityError extends Error {
  constructor(
    message: string,
    readonly seatsAvailable: number,
    readonly departureId: string,
  ) {
    super(message);
    this.name = 'CapacityError';
  }
}

export type BookingFinancialsInput = {
  costAmount: string | number;
  costCurrency: Currency;
  fxRate: string | number;
  sellingAmount: string | number;
  membershipDiscountPercent: string | number;
  membershipDiscountAmount: string | number;
};

/**
 * Derive every money column on a booking from its inputs.
 *
 * Kept pure and exported so the arithmetic can be unit tested without a
 * database, and so the booking form can show the same numbers it will save.
 */
export function computeBookingFinancials(input: BookingFinancialsInput) {
  const costAmountBase = convertToBase(input.costAmount, input.fxRate);
  const selling = toDecimal(input.sellingAmount);
  const discount = toDecimal(input.membershipDiscountAmount);

  // A discount larger than the sale would make the customer owe a negative
  // amount, which the payment roll-up cannot represent.
  const cappedDiscount = discount.gt(selling) ? selling : discount;
  const netSelling = subtract(selling, cappedDiscount);

  return {
    costAmount: toStorage(input.costAmount, input.costCurrency as CurrencyCode),
    costCurrency: input.costCurrency,
    fxRate: toDecimal(input.fxRate).toFixed(6),
    costAmountBase: toStorage(costAmountBase),
    sellingAmount: toStorage(selling),
    membershipDiscountPercent: toDecimal(input.membershipDiscountPercent).toFixed(2),
    membershipDiscountAmount: toStorage(cappedDiscount),
    netSellingAmount: toStorage(netSelling),
    // Margin is measured against what the customer actually pays, so a
    // membership discount correctly eats into our margin rather than theirs.
    marginAmount: toStorage(subtract(netSelling, costAmountBase)),
  };
}

/**
 * Build the instalment rows for a payment plan (PRD section 1.3).
 *
 * Applies to every booking type. Returns a deposit row and a balance row; when
 * the deposit covers the whole amount, the balance row is omitted rather than
 * created with a zero value.
 */
export function buildScheduleItems(input: {
  netSellingAmount: string | number;
  depositType: DepositType | null;
  depositValue: string | number | null;
  balanceDueDate: Date | null;
  bookingDate?: Date;
  departureDate?: Date | null;
}): Array<{
  kind: 'DEPOSIT' | 'BALANCE';
  sequence: number;
  amountDue: string;
  dueDate: Date;
}> {
  const total = toDecimal(input.netSellingAmount);
  if (!isPositive(total)) return [];

  const bookingDate = toDateOnly(input.bookingDate ?? new Date());

  // No plan configured: the whole amount is due at booking time.
  if (!input.depositType || input.depositValue === null || input.depositValue === undefined) {
    return [
      {
        kind: 'BALANCE',
        sequence: 0,
        amountDue: toStorage(total),
        dueDate: input.balanceDueDate ? toDateOnly(input.balanceDueDate) : bookingDate,
      },
    ];
  }

  const deposit = depositAmount(total, input.depositType, input.depositValue);
  const balance = subtract(total, deposit);

  const items: Array<{
    kind: 'DEPOSIT' | 'BALANCE';
    sequence: number;
    amountDue: string;
    dueDate: Date;
  }> = [];

  if (isPositive(deposit)) {
    items.push({
      kind: 'DEPOSIT',
      sequence: 0,
      amountDue: toStorage(deposit),
      dueDate: bookingDate,
    });
  }

  if (isPositive(balance)) {
    // The PRD's example is "45 days before travel". Without an explicit date we
    // fall back to the departure date, and finally to the booking date.
    const dueDate = input.balanceDueDate
      ? toDateOnly(input.balanceDueDate)
      : input.departureDate
        ? toDateOnly(input.departureDate)
        : bookingDate;

    items.push({
      kind: 'BALANCE',
      sequence: 1,
      amountDue: toStorage(balance),
      dueDate,
    });
  }

  return items;
}

export type CreateBookingInput = {
  customerId: string;
  type: BookingType;
  supplierId?: string | null;
  supplierRateSheetId?: string | null;
  departureDate?: Date | null;
  returnDate?: Date | null;
  adults?: number;
  children?: number;
  infants?: number;

  costAmount?: string | number;
  costCurrency?: Currency;
  fxRate?: string | number;
  sellingAmount: string | number;

  depositType?: DepositType | null;
  depositValue?: string | number | null;
  balanceDueDate?: Date | null;

  status?: BookingStatus;
  notes?: string | null;
  createdById?: string | null;

  /** Type-specific detail. Exactly one should match `type`. */
  flight?: Prisma.FlightDetailCreateWithoutBookingInput;
  hotel?: Prisma.HotelDetailCreateWithoutBookingInput;
  visa?: Prisma.VisaDetailCreateWithoutBookingInput;
  transport?: Prisma.TransportDetailCreateWithoutBookingInput;
  packageComponents?: Array<{
    kind: 'FLIGHT' | 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';
    description: string;
    supplierId?: string | null;
    costAmount?: string | number;
    costCurrency?: Currency;
    fxRate?: string | number;
    startDate?: Date | null;
    endDate?: Date | null;
  }>;
  groupAdventure?: {
    departureId: string;
    seats: number;
    singleSupplementSeats?: number;
  };

  travelers?: Array<{
    fullName: string;
    type?: 'ADULT' | 'CHILD' | 'INFANT';
    customerId?: string | null;
    passportNumber?: string | null;
    passportExpiry?: Date | null;
    nationality?: string | null;
    dateOfBirth?: Date | null;
    phone?: string | null;
    singleSupplement?: boolean;
  }>;
};

/**
 * Create a booking.
 *
 * Everything happens in one transaction: reference allocation, the membership
 * discount snapshot, Group Adventure seat reservation, the payment plan, and
 * the derived payment status. If any step fails, no seats are held and no
 * reference is committed.
 */
export async function createBooking(input: CreateBookingInput, db: Db = prisma) {
  const run = async (tx: Db) => {
    const now = new Date();

    // 1. Membership benefit, snapshotted so later tier changes never rewrite
    //    historical bookings.
    const benefit = await activeBenefitFor(tx, input.customerId, now);
    const discount = resolveMembershipDiscount(input.sellingAmount, benefit);

    const financials = computeBookingFinancials({
      costAmount: input.costAmount ?? 0,
      costCurrency: input.costCurrency ?? 'BHD',
      fxRate: input.fxRate ?? 1,
      sellingAmount: input.sellingAmount,
      membershipDiscountPercent: discount.percent,
      membershipDiscountAmount: discount.amount,
    });

    // 2. Reserve seats before anything else is written, so an oversold trip
    //    fails fast and cheaply.
    let groupDetail: { departureId: string; seats: number; singleSupplementSeats: number; pricePerSeat: string } | null =
      null;

    if (input.type === 'GROUP_ADVENTURE') {
      if (!input.groupAdventure) {
        throw new Error('A Group Adventure booking must name a departure');
      }
      const reserved = await reserveSeats(tx, {
        departureId: input.groupAdventure.departureId,
        seats: input.groupAdventure.seats,
      });
      groupDetail = {
        departureId: input.groupAdventure.departureId,
        seats: input.groupAdventure.seats,
        singleSupplementSeats: input.groupAdventure.singleSupplementSeats ?? 0,
        pricePerSeat: reserved.pricePerSeat,
      };
    }

    const reference = await nextBookingReference(tx, now);

    const booking = await tx.booking.create({
      data: {
        reference,
        customerId: input.customerId,
        type: input.type,
        supplierId: input.supplierId ?? null,
        supplierRateSheetId: input.supplierRateSheetId ?? null,
        departureDate: input.departureDate ? toDateOnly(input.departureDate) : null,
        returnDate: input.returnDate ? toDateOnly(input.returnDate) : null,
        adults: input.adults ?? 1,
        children: input.children ?? 0,
        infants: input.infants ?? 0,
        ...financials,
        status: input.status ?? BookingStatus.INQUIRY,
        depositType: input.depositType ?? null,
        depositValue:
          input.depositValue === null || input.depositValue === undefined
            ? null
            : toStorage(input.depositValue),
        balanceDueDate: input.balanceDueDate ? toDateOnly(input.balanceDueDate) : null,
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
        confirmedAt: input.status === BookingStatus.CONFIRMED ? now : null,

        flightDetail: input.flight ? { create: input.flight } : undefined,
        hotelDetail: input.hotel ? { create: input.hotel } : undefined,
        visaDetail: input.visa ? { create: input.visa } : undefined,
        transportDetail: input.transport ? { create: input.transport } : undefined,
        groupDetail: groupDetail ? { create: groupDetail } : undefined,

        packageComponents: input.packageComponents
          ? {
              create: input.packageComponents.map((component, index) => ({
                kind: component.kind,
                description: component.description,
                supplierId: component.supplierId ?? null,
                costAmount: toStorage(
                  component.costAmount ?? 0,
                  (component.costCurrency ?? 'BHD') as CurrencyCode,
                ),
                costCurrency: component.costCurrency ?? 'BHD',
                fxRate: toDecimal(component.fxRate ?? 1).toFixed(6),
                costAmountBase: toStorage(
                  convertToBase(component.costAmount ?? 0, component.fxRate ?? 1),
                ),
                startDate: component.startDate ? toDateOnly(component.startDate) : null,
                endDate: component.endDate ? toDateOnly(component.endDate) : null,
                sortOrder: index,
              })),
            }
          : undefined,

        travelers: input.travelers
          ? {
              create: input.travelers.map((traveler) => ({
                fullName: traveler.fullName,
                type: traveler.type ?? 'ADULT',
                customerId: traveler.customerId ?? null,
                passportNumber: traveler.passportNumber ?? null,
                passportExpiry: traveler.passportExpiry
                  ? toDateOnly(traveler.passportExpiry)
                  : null,
                nationality: traveler.nationality ?? null,
                dateOfBirth: traveler.dateOfBirth ? toDateOnly(traveler.dateOfBirth) : null,
                phone: traveler.phone ?? null,
                singleSupplement: traveler.singleSupplement ?? false,
              })),
            }
          : undefined,
      },
    });

    // 3. Payment plan.
    const items = buildScheduleItems({
      netSellingAmount: financials.netSellingAmount,
      depositType: input.depositType ?? null,
      depositValue: input.depositValue ?? null,
      balanceDueDate: input.balanceDueDate ?? null,
      bookingDate: now,
      departureDate: input.departureDate ?? null,
    });

    if (items.length > 0) {
      await tx.paymentScheduleItem.createMany({
        data: items.map((item) => ({ ...item, bookingId: booking.id })),
      });
    }

    await recalcBookingPaymentStatus(tx, booking.id);

    // 4. Queue notifications. Enqueueing only writes an outbox row; nothing is
    //    sent here, so a WhatsApp outage can never fail a booking.
    if (booking.status === BookingStatus.CONFIRMED) {
      await enqueueBookingConfirmed(tx, booking.id);
    }
    if (groupDetail) {
      await enqueueCapacityAlertIfNeeded(tx, groupDetail.departureId);
    }

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: {
        customer: true,
        supplier: true,
        flightDetail: true,
        hotelDetail: true,
        visaDetail: true,
        transportDetail: true,
        groupDetail: { include: { departure: true } },
        packageComponents: true,
        travelers: true,
        scheduleItems: { orderBy: { dueDate: 'asc' } },
      },
    });
  };

  // Reuse the caller's transaction when there is one, so callers can compose.
  return inTransaction(db, run);
}

/**
 * Hold seats on a departure.
 *
 * `SELECT ... FOR UPDATE` locks the departure row for the rest of the
 * transaction, so two staff booking the last seat at the same moment are
 * serialised and the second one is rejected instead of overselling the trip.
 */
export async function reserveSeats(
  tx: Db,
  input: { departureId: string; seats: number },
): Promise<{ pricePerSeat: string; seatsRemaining: number }> {
  if (!Number.isInteger(input.seats) || input.seats < 1) {
    throw new Error('Seat count must be a positive whole number');
  }

  const locked = await tx.$queryRaw<
    Array<{ id: string; capacity: number; seats_booked: number; price_per_seat: string; status: DepartureStatus }>
  >`
    SELECT id, capacity, "seatsBooked" AS seats_booked, "pricePerSeat" AS price_per_seat, status
    FROM group_departures
    WHERE id = ${input.departureId}
    FOR UPDATE
  `;

  const departure = locked[0];
  if (!departure) throw new Error(`Departure ${input.departureId} not found`);

  if (
    departure.status === DepartureStatus.CANCELLED ||
    departure.status === DepartureStatus.CLOSED ||
    departure.status === DepartureStatus.COMPLETED
  ) {
    throw new CapacityError(
      `This departure is ${departure.status.toLowerCase()} and is not taking bookings`,
      0,
      input.departureId,
    );
  }

  const available = departure.capacity - departure.seats_booked;
  if (input.seats > available) {
    throw new CapacityError(
      available <= 0
        ? 'This departure is full. Add the customer to the waitlist instead.'
        : `Only ${available} seat${available === 1 ? '' : 's'} left on this departure.`,
      Math.max(0, available),
      input.departureId,
    );
  }

  const seatsBooked = departure.seats_booked + input.seats;
  const isFull = seatsBooked >= departure.capacity;

  await tx.groupDeparture.update({
    where: { id: input.departureId },
    data: {
      seatsBooked,
      // Reaching capacity is what auto-enables the waitlist (PRD section 1.4).
      ...(isFull ? { status: DepartureStatus.FULL, waitlistEnabled: true } : {}),
    },
  });

  return {
    pricePerSeat: toStorage(departure.price_per_seat),
    seatsRemaining: departure.capacity - seatsBooked,
  };
}

/** Give seats back, e.g. when a group booking is cancelled. */
export async function releaseSeats(
  tx: Db,
  input: { departureId: string; seats: number },
): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ capacity: number; seats_booked: number; status: DepartureStatus }>>`
    SELECT capacity, "seatsBooked" AS seats_booked, status
    FROM group_departures
    WHERE id = ${input.departureId}
    FOR UPDATE
  `;

  const departure = locked[0];
  if (!departure) return;

  const seatsBooked = Math.max(0, departure.seats_booked - input.seats);

  await tx.groupDeparture.update({
    where: { id: input.departureId },
    data: {
      seatsBooked,
      // Freeing a seat reopens a trip that had filled up, but never revives one
      // that staff deliberately closed or cancelled.
      ...(departure.status === DepartureStatus.FULL && seatsBooked < departure.capacity
        ? { status: DepartureStatus.OPEN }
        : {}),
    },
  });
}

/**
 * Move a booking through Inquiry → Confirmed → Ticketed → Completed →
 * Cancelled, applying the side effects each transition implies.
 */
export async function updateBookingStatus(
  input: {
    bookingId: string;
    status: BookingStatus;
    cancelReason?: string | null;
  },
  db: Db = prisma,
) {
  const run = async (tx: Db) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: { groupDetail: true },
    });
    if (!booking) throw new Error(`Booking ${input.bookingId} not found`);
    if (booking.status === input.status) return booking;

    const now = new Date();
    const wasCancelled = booking.status === BookingStatus.CANCELLED;
    const isCancelling = input.status === BookingStatus.CANCELLED;

    if (wasCancelled && !isCancelling && booking.groupDetail) {
      // Reinstating a cancelled group booking has to re-acquire its seats, and
      // may legitimately fail if the trip filled up in the meantime.
      await reserveSeats(tx, {
        departureId: booking.groupDetail.departureId,
        seats: booking.groupDetail.seats,
      });
    }

    if (isCancelling && booking.groupDetail) {
      await releaseSeats(tx, {
        departureId: booking.groupDetail.departureId,
        seats: booking.groupDetail.seats,
      });
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: input.status,
        cancelledAt: isCancelling ? now : null,
        cancelReason: isCancelling ? (input.cancelReason ?? null) : null,
        confirmedAt:
          input.status === BookingStatus.CONFIRMED && !booking.confirmedAt
            ? now
            : booking.confirmedAt,
      },
      include: { groupDetail: true },
    });

    if (isCancelling) {
      // Stop any reminder that has not gone out yet; the customer has
      // cancelled and should not be chased for a balance.
      await tx.notificationOutbox.updateMany({
        where: { bookingId: booking.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.paymentScheduleItem.updateMany({
        where: { bookingId: booking.id, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
        data: { status: 'CANCELLED' },
      });
    }

    if (input.status === BookingStatus.CONFIRMED) {
      await enqueueBookingConfirmed(tx, booking.id);
    }

    await recalcBookingPaymentStatus(tx, booking.id);
    return updated;
  };

  return inTransaction(db, run);
}

/** Balance instalments falling due within `daysAhead`, for the reminder job. */
export async function scheduleItemsDueForReminder(
  db: Db,
  daysAhead: number,
  now: Date = new Date(),
) {
  const from = today(now);
  const to = addDays(from, daysAhead);

  return db.paymentScheduleItem.findMany({
    where: {
      kind: 'BALANCE',
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      dueDate: { gte: from, lte: to },
      booking: { status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] } },
    },
    include: {
      booking: {
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true, whatsappPhone: true },
          },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });
}

/** Remaining balance on a booking. */
export function bookingBalance(booking: {
  netSellingAmount: Prisma.Decimal | string | number;
  scheduleItems?: Array<{ amountDue: Prisma.Decimal | string; paidAmount: Prisma.Decimal | string }>;
}) {
  if (!booking.scheduleItems || booking.scheduleItems.length === 0) {
    return toStorage(booking.netSellingAmount);
  }
  const due = add(...booking.scheduleItems.map((i) => i.amountDue));
  const paid = add(...booking.scheduleItems.map((i) => i.paidAmount));
  const balance = subtract(due, paid);
  return toStorage(gt(balance, 0) ? balance : 0);
}
