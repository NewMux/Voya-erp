import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '@/lib/prisma';

/**
 * Customer lookup.
 *
 * The PRD makes the membership number the primary search key on the booking
 * screen, so an exact membership-number match short-circuits everything else
 * and returns that one customer — staff typing "VY-0001042" want that member,
 * not a fuzzy list.
 */

export type CustomerSearchResult = Prisma.CustomerGetPayload<{
  include: { membership: true };
}>;

/** True for anything that looks like a membership number, with or without the prefix. */
export function looksLikeMembershipNumber(query: string): boolean {
  return /^(vy-?)?\d{1,7}$/i.test(query.trim());
}

/** Canonical form: VY-0001042. Accepts "1042", "vy1042", "VY-1042". */
export function canonicalMembershipNumber(query: string): string {
  const digits = query.trim().replace(/^vy-?/i, '').replace(/\D/g, '');
  return `VY-${digits.padStart(7, '0')}`;
}

/**
 * Search customers by membership number, name or phone.
 *
 * Phone matching strips non-digits from both sides, so "+973 3300 1122",
 * "97333001122" and "33001122" all find the same customer — staff copy numbers
 * from WhatsApp in every conceivable format.
 */
export async function searchCustomers(
  query: string,
  options: { limit?: number; db?: Db } = {},
): Promise<CustomerSearchResult[]> {
  const db = options.db ?? prisma;
  const limit = options.limit ?? 25;
  const trimmed = query.trim();

  if (!trimmed) {
    return db.customer.findMany({
      where: { isActive: true },
      include: { membership: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Membership number wins outright when it matches.
  if (looksLikeMembershipNumber(trimmed)) {
    const exact = await db.customer.findMany({
      where: { membership: { membershipNumber: canonicalMembershipNumber(trimmed) } },
      include: { membership: true },
      take: 1,
    });
    if (exact.length > 0) return exact;
  }

  const digits = trimmed.replace(/\D/g, '');

  const results = await db.customer.findMany({
    where: {
      OR: [
        { fullName: { contains: trimmed, mode: 'insensitive' } },
        { companyName: { contains: trimmed, mode: 'insensitive' } },
        { email: { contains: trimmed, mode: 'insensitive' } },
        { passportNumber: { equals: trimmed, mode: 'insensitive' } },
        { membership: { membershipNumber: { contains: trimmed, mode: 'insensitive' } } },
      ],
    },
    include: { membership: true },
    orderBy: { fullName: 'asc' },
    take: limit,
  });

  if (digits.length < 6) return results;

  // Phone comparison ignores formatting on both sides, which a `contains`
  // filter on the raw column cannot do.
  const byPhone = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM customers
    WHERE regexp_replace(phone, '\D', '', 'g') LIKE ${'%' + digits}
       OR regexp_replace(COALESCE("whatsappPhone", ''), '\D', '', 'g') LIKE ${'%' + digits}
    LIMIT ${limit}
  `;

  const missing = byPhone.map((r) => r.id).filter((id) => !results.some((c) => c.id === id));
  if (missing.length === 0) return results;

  const phoneMatches = await db.customer.findMany({
    where: { id: { in: missing } },
    include: { membership: true },
  });

  return [...results, ...phoneMatches].slice(0, limit);
}

/** Full booking history for the customer detail page. */
export async function customerBookingHistory(customerId: string, db: Db = prisma) {
  return db.booking.findMany({
    where: { customerId },
    orderBy: [{ departureDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      supplier: { select: { name: true } },
      scheduleItems: { select: { amountDue: true, paidAmount: true, status: true } },
      // Destination-bearing detail, for the Travel history summary — which
      // country/city/trip this booking actually went to, per type.
      flightDetail: { select: { routeTo: true } },
      hotelDetail: { select: { city: true, propertyName: true } },
      visaDetail: { select: { destinationCountry: true } },
      transportDetail: { select: { dropoffLocation: true, pickupLocation: true } },
      groupDetail: { select: { departure: { select: { destination: true, name: true } } } },
    },
  });
}

/** A destination string for the Travel history summary, per booking type. */
export function bookingDestination(
  booking: Awaited<ReturnType<typeof customerBookingHistory>>[number],
): string | null {
  switch (booking.type) {
    case 'FLIGHT':
      return booking.flightDetail?.routeTo ?? null;
    case 'HOTEL':
      return booking.hotelDetail?.city ?? booking.hotelDetail?.propertyName ?? null;
    case 'VISA':
      return booking.visaDetail?.destinationCountry ?? null;
    case 'TRANSPORT':
      return booking.transportDetail?.dropoffLocation ?? booking.transportDetail?.pickupLocation ?? null;
    case 'GROUP_ADVENTURE':
      return booking.groupDetail?.departure.destination ?? booking.groupDetail?.departure.name ?? null;
    case 'PACKAGE':
      return null;
  }
}
