import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import { makeCustomer, makeDeparture, makeSupplier, seedNotificationTemplates } from './helpers/factories';
import {
  CapacityError,
  buildScheduleItems,
  computeBookingFinancials,
  createBooking,
  reserveSeats,
  updateBookingStatus,
} from '@/server/services/booking.service';
import { issueMembership } from '@/server/services/membership.service';

beforeEach(async () => {
  await resetDatabase();
  await seedNotificationTemplates();
});
afterAll(disconnect);

describe('computeBookingFinancials', () => {
  it('converts supplier cost at the entry-time rate', () => {
    const result = computeBookingFinancials({
      costAmount: '500',
      costCurrency: 'USD',
      fxRate: '0.376',
      sellingAmount: '250',
      membershipDiscountPercent: 0,
      membershipDiscountAmount: 0,
    });

    expect(result.costAmountBase).toBe('188.000');
    expect(result.marginAmount).toBe('62.000');
  });

  it('charges the discount against margin, not the customer', () => {
    const result = computeBookingFinancials({
      costAmount: '100',
      costCurrency: 'BHD',
      fxRate: 1,
      sellingAmount: '200',
      membershipDiscountPercent: '10.00',
      membershipDiscountAmount: '20',
    });

    expect(result.netSellingAmount).toBe('180.000');
    // Margin drops from 100 to 80 — the agency absorbs the member discount.
    expect(result.marginAmount).toBe('80.000');
  });

  it('caps a discount larger than the sale so the customer never owes a negative', () => {
    const result = computeBookingFinancials({
      costAmount: 0,
      costCurrency: 'BHD',
      fxRate: 1,
      sellingAmount: '100',
      membershipDiscountPercent: '200.00',
      membershipDiscountAmount: '200',
    });

    expect(result.membershipDiscountAmount).toBe('100.000');
    expect(result.netSellingAmount).toBe('0.000');
  });
});

describe('buildScheduleItems', () => {
  it('builds the PRD example: 30% deposit, balance 45 days before travel', () => {
    const items = buildScheduleItems({
      netSellingAmount: '1000',
      depositType: 'PERCENT',
      depositValue: 30,
      balanceDueDate: new Date('2026-09-01'),
      bookingDate: new Date('2026-06-01'),
      departureDate: new Date('2026-10-16'),
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'DEPOSIT', amountDue: '300.000' });
    expect(items[1]).toMatchObject({ kind: 'BALANCE', amountDue: '700.000' });
    expect(items[1]?.dueDate.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('omits the balance row when the deposit is the full amount', () => {
    const items = buildScheduleItems({
      netSellingAmount: '500',
      depositType: 'PERCENT',
      depositValue: 100,
      balanceDueDate: null,
      bookingDate: new Date('2026-06-01'),
      departureDate: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('DEPOSIT');
  });

  it('falls back to the departure date when no balance date is given', () => {
    const items = buildScheduleItems({
      netSellingAmount: '1000',
      depositType: 'PERCENT',
      depositValue: 25,
      balanceDueDate: null,
      bookingDate: new Date('2026-06-01'),
      departureDate: new Date('2026-10-16'),
    });

    expect(items[1]?.dueDate.toISOString().slice(0, 10)).toBe('2026-10-16');
  });

  it('treats no payment plan as the whole amount due at booking', () => {
    const items = buildScheduleItems({
      netSellingAmount: '750',
      depositType: null,
      depositValue: null,
      balanceDueDate: null,
      bookingDate: new Date('2026-06-01'),
      departureDate: null,
    });

    expect(items).toEqual([
      expect.objectContaining({ kind: 'BALANCE', amountDue: '750.000' }),
    ]);
  });

  it('produces nothing for a zero-value booking', () => {
    expect(
      buildScheduleItems({
        netSellingAmount: '0',
        depositType: 'PERCENT',
        depositValue: 30,
        balanceDueDate: null,
        bookingDate: new Date(),
        departureDate: null,
      }),
    ).toEqual([]);
  });
});

describe('createBooking', () => {
  it('allocates a reference and a payment plan', async () => {
    const customer = await makeCustomer();
    const supplier = await makeSupplier();

    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      supplierId: supplier.id,
      sellingAmount: '1000',
      costAmount: '800',
      costCurrency: 'BHD',
      fxRate: 1,
      depositType: 'PERCENT',
      depositValue: 30,
      balanceDueDate: new Date('2026-09-01'),
      departureDate: new Date('2026-10-16'),
      flight: {
        airline: 'Gulf Air',
        pnr: 'ABC123',
        routeFrom: 'BAH',
        routeTo: 'TBS',
        cabinClass: 'Economy',
      },
    });

    expect(booking.reference).toMatch(/^VB-\d{4}-\d{6}$/);
    expect(booking.paymentStatus).toBe('UNPAID');
    expect(booking.scheduleItems).toHaveLength(2);
    expect(booking.flightDetail?.pnr).toBe('ABC123');
  });

  it('applies and snapshots an active membership discount', async () => {
    const customer = await makeCustomer();
    await issueMembership(testDb, {
      customerId: customer.id,
      discountPercent: 10,
      startDate: new Date('2026-01-01'),
      expiryDate: new Date('2099-12-31'),
    });

    const booking = await createBooking({
      customerId: customer.id,
      type: 'HOTEL',
      sellingAmount: '500',
      hotel: {
        propertyName: 'Test Hotel',
        checkIn: new Date('2026-10-12'),
        checkOut: new Date('2026-10-16'),
        boardBasis: 'BB',
      },
    });

    expect(booking.membershipDiscountPercent.toString()).toBe('10');
    expect(booking.membershipDiscountAmount.toString()).toBe('50');
    expect(booking.netSellingAmount.toString()).toBe('450');
  });

  it('ignores an expired membership', async () => {
    const customer = await makeCustomer();
    await issueMembership(testDb, {
      customerId: customer.id,
      discountPercent: 10,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2021-01-01'),
    });

    const booking = await createBooking({
      customerId: customer.id,
      type: 'VISA',
      sellingAmount: '100',
      visa: { destinationCountry: 'GE', visaType: 'Tourist' },
    });

    expect(booking.netSellingAmount.toString()).toBe('100');
  });

  it('queues a confirmation when created already confirmed', async () => {
    const customer = await makeCustomer();

    const booking = await createBooking({
      customerId: customer.id,
      type: 'TRANSPORT',
      sellingAmount: '60',
      status: 'CONFIRMED',
      transport: { kind: 'AIRPORT_TRANSFER', pickupLocation: 'BAH Airport' },
    });

    const outbox = await testDb.notificationOutbox.findMany({ where: { bookingId: booking.id } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.event).toBe('BOOKING_CONFIRMED');
    expect(outbox[0]?.renderedBodyEn).toContain(booking.reference);
  });

  it('rolls the whole booking back when a step fails', async () => {
    const customer = await makeCustomer();
    const departure = await makeDeparture({ capacity: 1, seatsBooked: 1 });

    await expect(
      createBooking({
        customerId: customer.id,
        type: 'GROUP_ADVENTURE',
        sellingAmount: '400',
        groupAdventure: { departureId: departure.id, seats: 1 },
      }),
    ).rejects.toThrow(CapacityError);

    // No orphan booking row survived the failed transaction.
    expect(await testDb.booking.count()).toBe(0);
  });
});

describe('group adventure capacity', () => {
  it('books seats and keeps the live counter', async () => {
    const customer = await makeCustomer();
    const departure = await makeDeparture({ capacity: 3 });

    await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '800',
      groupAdventure: { departureId: departure.id, seats: 2 },
    });

    const after = await testDb.groupDeparture.findUniqueOrThrow({ where: { id: departure.id } });
    expect(after.seatsBooked).toBe(2);
    expect(after.status).toBe('OPEN');
  });

  it('marks the departure full and enables the waitlist at capacity', async () => {
    const customer = await makeCustomer();
    const departure = await makeDeparture({ capacity: 2 });

    await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '800',
      groupAdventure: { departureId: departure.id, seats: 2 },
    });

    const after = await testDb.groupDeparture.findUniqueOrThrow({ where: { id: departure.id } });
    expect(after.status).toBe('FULL');
    expect(after.waitlistEnabled).toBe(true);
  });

  it('refuses to oversell and reports what is left', async () => {
    const customer = await makeCustomer();
    const departure = await makeDeparture({ capacity: 2, seatsBooked: 1 });

    await expect(
      createBooking({
        customerId: customer.id,
        type: 'GROUP_ADVENTURE',
        sellingAmount: '800',
        groupAdventure: { departureId: departure.id, seats: 2 },
      }),
    ).rejects.toMatchObject({ name: 'CapacityError', seatsAvailable: 1 });
  });

  it('serialises concurrent bookings for the last seat', async () => {
    // The reason reserveSeats takes a row lock: without it both callers read
    // seatsBooked = 0 and both succeed, overselling the trip.
    const departure = await makeDeparture({ capacity: 1 });
    const [a, b] = await Promise.all([makeCustomer(), makeCustomer()]);

    const results = await Promise.allSettled([
      createBooking({
        customerId: a.id,
        type: 'GROUP_ADVENTURE',
        sellingAmount: '400',
        groupAdventure: { departureId: departure.id, seats: 1 },
      }),
      createBooking({
        customerId: b.id,
        type: 'GROUP_ADVENTURE',
        sellingAmount: '400',
        groupAdventure: { departureId: departure.id, seats: 1 },
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const after = await testDb.groupDeparture.findUniqueOrThrow({ where: { id: departure.id } });
    expect(after.seatsBooked).toBe(1);
  });

  it('rejects a departure that is closed', async () => {
    const departure = await makeDeparture({ capacity: 5, status: 'CLOSED' });
    await expect(
      testDb.$transaction((tx) => reserveSeats(tx, { departureId: departure.id, seats: 1 })),
    ).rejects.toThrow(CapacityError);
  });

  it('returns seats and reopens the trip when a booking is cancelled', async () => {
    const customer = await makeCustomer();
    const departure = await makeDeparture({ capacity: 2 });

    const booking = await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '800',
      groupAdventure: { departureId: departure.id, seats: 2 },
    });

    await updateBookingStatus({
      bookingId: booking.id,
      status: 'CANCELLED',
      cancelReason: 'Customer withdrew',
    });

    const after = await testDb.groupDeparture.findUniqueOrThrow({ where: { id: departure.id } });
    expect(after.seatsBooked).toBe(0);
    expect(after.status).toBe('OPEN');
  });
});

describe('booking status transitions', () => {
  it('cancels outstanding instalments and pending reminders', async () => {
    const customer = await makeCustomer();
    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '1000',
      depositType: 'PERCENT',
      depositValue: 30,
      status: 'CONFIRMED',
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    await updateBookingStatus({ bookingId: booking.id, status: 'CANCELLED' });

    const items = await testDb.paymentScheduleItem.findMany({ where: { bookingId: booking.id } });
    expect(items.every((i) => i.status === 'CANCELLED')).toBe(true);

    const pending = await testDb.notificationOutbox.count({
      where: { bookingId: booking.id, status: 'PENDING' },
    });
    expect(pending).toBe(0);
  });

  it('queues exactly one confirmation however often it is re-confirmed', async () => {
    const customer = await makeCustomer();
    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '500',
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    await updateBookingStatus({ bookingId: booking.id, status: 'CONFIRMED' });
    await updateBookingStatus({ bookingId: booking.id, status: 'TICKETED' });
    await updateBookingStatus({ bookingId: booking.id, status: 'CONFIRMED' });

    const count = await testDb.notificationOutbox.count({
      where: { bookingId: booking.id, event: 'BOOKING_CONFIRMED' },
    });
    expect(count).toBe(1);
  });
});
