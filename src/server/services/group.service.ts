import { prisma, type Db } from '@/lib/prisma';
import { inTransaction } from '@/lib/tx';
import { toDateOnly } from '@/lib/dates';
import { formatDate } from '@/lib/dates';

/**
 * Group Adventures — PRD section 1.4.
 *
 * Seat reservation itself lives in booking.service, because it has to happen
 * inside the booking transaction. This module covers templates, departures, the
 * waitlist and the roster.
 */

/**
 * Create a departure, copying the template's itinerary onto it.
 *
 * The copy is deliberate: once a trip is on sale, editing the template must not
 * silently rewrite the itinerary that customers were sold.
 */
export async function createDeparture(
  input: {
    templateId?: string | null;
    name: string;
    destination?: string | null;
    departureDate: Date;
    returnDate?: Date | null;
    capacity: number;
    pricePerSeat: string;
    singleSupplement?: string;
    // Set once per trip here — GROUP_ADVENTURE bookings derive their cost
    // from this instead of staff entering it per traveller.
    costPerSeat?: string;
    costCurrency?: 'BHD' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED';
    costFxRate?: string;
    tourLeaderName?: string | null;
    notes?: string | null;
    status?: 'DRAFT' | 'OPEN';
  },
  db: Db = prisma,
) {
  if (input.capacity < 1) {
    throw new Error('Capacity must be at least one seat.');
  }
  if (
    input.returnDate &&
    toDateOnly(input.returnDate).getTime() < toDateOnly(input.departureDate).getTime()
  ) {
    throw new Error('The return date cannot be before the departure date.');
  }

  return inTransaction(db, async (tx) => {
    const departure = await tx.groupDeparture.create({
      data: {
        templateId: input.templateId ?? null,
        name: input.name,
        destination: input.destination ?? null,
        departureDate: toDateOnly(input.departureDate),
        returnDate: input.returnDate ? toDateOnly(input.returnDate) : null,
        capacity: input.capacity,
        pricePerSeat: input.pricePerSeat,
        singleSupplement: input.singleSupplement ?? '0',
        costPerSeat: input.costPerSeat ?? '0',
        costCurrency: input.costCurrency ?? 'BHD',
        costFxRate: input.costFxRate ?? '1',
        tourLeaderName: input.tourLeaderName ?? null,
        notes: input.notes ?? null,
        status: input.status ?? 'OPEN',
      },
    });

    if (input.templateId) {
      const days = await tx.groupItineraryDay.findMany({
        where: { templateId: input.templateId },
        orderBy: { dayNumber: 'asc' },
      });

      if (days.length > 0) {
        await tx.groupItineraryDay.createMany({
          data: days.map((day) => ({
            departureId: departure.id,
            dayNumber: day.dayNumber,
            title: day.title,
            description: day.description,
          })),
        });
      }
    }

    return departure;
  });
}

/**
 * Add a customer to a departure's waitlist.
 *
 * `priority` is snapshotted from the membership at the time of joining, so a
 * member who joined first is not later leapfrogged by someone whose membership
 * was upgraded afterwards.
 */
export async function joinWaitlist(
  input: { departureId: string; customerId: string; requestedSeats?: number; notes?: string | null },
  db: Db = prisma,
) {
  const membership = await db.membership.findUnique({
    where: { customerId: input.customerId },
    select: { status: true, groupBookingPriority: true, expiryDate: true },
  });

  const priority =
    membership?.status === 'ACTIVE' &&
    membership.groupBookingPriority &&
    membership.expiryDate.getTime() >= toDateOnly(new Date()).getTime();

  return db.groupWaitlistEntry.upsert({
    where: {
      departureId_customerId: { departureId: input.departureId, customerId: input.customerId },
    },
    // Re-joining after cancelling reopens the existing entry rather than
    // failing on the unique constraint.
    update: {
      status: 'WAITING',
      requestedSeats: input.requestedSeats ?? 1,
      notes: input.notes ?? null,
      resolvedAt: null,
    },
    create: {
      departureId: input.departureId,
      customerId: input.customerId,
      requestedSeats: input.requestedSeats ?? 1,
      notes: input.notes ?? null,
      priority: priority ?? false,
    },
  });
}

/**
 * The waitlist in the order seats should be offered.
 *
 * Members with group-booking priority come first — one of the two benefits the
 * PRD attaches to membership — then by when they joined.
 */
export async function waitlistInOrder(departureId: string, db: Db = prisma) {
  return db.groupWaitlistEntry.findMany({
    where: { departureId, status: { in: ['WAITING', 'OFFERED'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: {
      customer: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          whatsappPhone: true,
          membership: { select: { membershipNumber: true, tier: true } },
        },
      },
    },
  });
}

/** Everyone travelling on a departure, for the tour leader. */
export async function departureRoster(departureId: string, db: Db = prisma) {
  const bookings = await db.booking.findMany({
    where: {
      groupDetail: { departureId },
      status: { not: 'CANCELLED' },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      customer: {
        select: {
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
          passportNumber: true,
          passportExpiry: true,
        },
      },
      groupDetail: true,
      travelers: { orderBy: { createdAt: 'asc' } },
    },
  });

  return bookings.flatMap((booking) => {
    // Travellers are named individually where staff have entered them;
    // otherwise the lead customer stands in, so the roster is never empty for
    // a booking that holds seats.
    if (booking.travelers.length > 0) {
      return booking.travelers.map((traveler) => ({
        bookingReference: booking.reference,
        leadCustomer: booking.customer.fullName,
        fullName: traveler.fullName,
        type: traveler.type,
        phone: traveler.phone ?? booking.customer.phone,
        nationality: traveler.nationality ?? booking.customer.nationality,
        passportNumber: traveler.passportNumber,
        passportExpiry: traveler.passportExpiry,
        singleSupplement: traveler.singleSupplement,
        seats: booking.groupDetail?.seats ?? 0,
      }));
    }

    return [
      {
        bookingReference: booking.reference,
        leadCustomer: booking.customer.fullName,
        fullName: booking.customer.fullName,
        type: 'ADULT' as const,
        phone: booking.customer.phone,
        nationality: booking.customer.nationality,
        passportNumber: booking.customer.passportNumber,
        passportExpiry: booking.customer.passportExpiry,
        singleSupplement: (booking.groupDetail?.singleSupplementSeats ?? 0) > 0,
        seats: booking.groupDetail?.seats ?? 0,
      },
    ];
  });
}

/** Escape a value for CSV: quote it and double any embedded quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? formatDate(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Roster as CSV, for the tour leader to print or share. */
export function rosterToCsv(rows: Awaited<ReturnType<typeof departureRoster>>): string {
  const header = [
    'Booking',
    'Lead customer',
    'Traveller',
    'Type',
    'Phone',
    'Nationality',
    'Passport number',
    'Passport expiry',
    'Single supplement',
  ];

  const lines = rows.map((row) =>
    [
      row.bookingReference,
      row.leadCustomer,
      row.fullName,
      row.type,
      row.phone,
      row.nationality,
      row.passportNumber,
      row.passportExpiry,
      row.singleSupplement ? 'Yes' : 'No',
    ]
      .map(csvCell)
      .join(','),
  );

  // A BOM so Excel opens the file as UTF-8 and Arabic names are not mangled.
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}

/** Departure with its live seat counts, for the detail page. */
export async function departureWithCounts(departureId: string, db: Db = prisma) {
  const departure = await db.groupDeparture.findUnique({
    where: { id: departureId },
    include: {
      template: { select: { id: true, name: true } },
      itineraryDays: { orderBy: { dayNumber: 'asc' } },
      bookings: {
        include: {
          booking: {
            include: { customer: { select: { id: true, fullName: true, phone: true } } },
          },
        },
      },
    },
  });

  if (!departure) return null;

  const activeBookings = departure.bookings.filter((b) => b.booking.status !== 'CANCELLED');

  return {
    ...departure,
    activeBookings,
    seatsRemaining: Math.max(0, departure.capacity - departure.seatsBooked),
    percentFull:
      departure.capacity > 0
        ? Math.round((departure.seatsBooked / departure.capacity) * 100)
        : 0,
  };
}
