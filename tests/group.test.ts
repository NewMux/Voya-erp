import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import { makeCustomer, makeDeparture, seedNotificationTemplates } from './helpers/factories';
import {
  createDeparture,
  departureRoster,
  joinWaitlist,
  rosterToCsv,
  waitlistInOrder,
} from '@/server/services/group.service';
import { createBooking } from '@/server/services/booking.service';
import { issueMembership } from '@/server/services/membership.service';

beforeEach(async () => {
  await resetDatabase();
  await seedNotificationTemplates();
});
afterAll(disconnect);

describe('createDeparture', () => {
  it('copies the template itinerary onto the departure', async () => {
    // The copy is what stops a later template edit rewriting a sold trip.
    const template = await testDb.groupTripTemplate.create({
      data: {
        name: 'Georgia Explorer',
        durationDays: 3,
        itineraryDays: {
          create: [
            { dayNumber: 1, title: 'Arrive' },
            { dayNumber: 2, title: 'Kazbegi' },
            { dayNumber: 3, title: 'Depart' },
          ],
        },
      },
    });

    const departure = await createDeparture({
      templateId: template.id,
      name: 'October 2026',
      departureDate: new Date('2026-10-12'),
      capacity: 12,
      pricePerSeat: '425.000',
    });

    const days = await testDb.groupItineraryDay.findMany({
      where: { departureId: departure.id },
      orderBy: { dayNumber: 'asc' },
    });
    expect(days).toHaveLength(3);
    expect(days[1]?.title).toBe('Kazbegi');

    // Editing the template afterwards must not touch the departure.
    await testDb.groupItineraryDay.updateMany({
      where: { templateId: template.id, dayNumber: 2 },
      data: { title: 'Changed later' },
    });

    const unchanged = await testDb.groupItineraryDay.findFirstOrThrow({
      where: { departureId: departure.id, dayNumber: 2 },
    });
    expect(unchanged.title).toBe('Kazbegi');
  });

  it('works without a template', async () => {
    const departure = await createDeparture({
      name: 'One-off trip',
      departureDate: new Date('2026-10-12'),
      capacity: 6,
      pricePerSeat: '300.000',
    });
    expect(departure.templateId).toBeNull();
    expect(departure.status).toBe('OPEN');
  });

  it('rejects zero capacity', async () => {
    await expect(
      createDeparture({
        name: 'Bad trip',
        departureDate: new Date('2026-10-12'),
        capacity: 0,
        pricePerSeat: '100',
      }),
    ).rejects.toThrow(/at least one seat/i);
  });

  it('rejects a return date before departure', async () => {
    await expect(
      createDeparture({
        name: 'Bad trip',
        departureDate: new Date('2026-10-12'),
        returnDate: new Date('2026-10-01'),
        capacity: 4,
        pricePerSeat: '100',
      }),
    ).rejects.toThrow(/return date cannot be before/i);
  });
});

describe('waitlist', () => {
  it('orders members with priority ahead of non-members', async () => {
    const departure = await makeDeparture({ capacity: 1 });

    const plain = await makeCustomer({ fullName: 'Plain Customer' });
    const member = await makeCustomer({ fullName: 'Priority Member' });
    await issueMembership(testDb, {
      customerId: member.id,
      groupBookingPriority: true,
      expiryDate: new Date('2099-12-31'),
    });

    // The non-member joins first, so only priority can reorder them.
    await joinWaitlist({ departureId: departure.id, customerId: plain.id });
    await joinWaitlist({ departureId: departure.id, customerId: member.id });

    const order = await waitlistInOrder(departure.id);
    expect(order.map((e) => e.customer.fullName)).toEqual([
      'Priority Member',
      'Plain Customer',
    ]);
  });

  it('orders by join time within the same priority', async () => {
    const departure = await makeDeparture({ capacity: 1 });
    const first = await makeCustomer({ fullName: 'First' });
    const second = await makeCustomer({ fullName: 'Second' });

    await joinWaitlist({ departureId: departure.id, customerId: first.id });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await joinWaitlist({ departureId: departure.id, customerId: second.id });

    const order = await waitlistInOrder(departure.id);
    expect(order.map((e) => e.customer.fullName)).toEqual(['First', 'Second']);
  });

  it('does not give priority to an expired membership', async () => {
    const departure = await makeDeparture({ capacity: 1 });
    const lapsed = await makeCustomer();
    await issueMembership(testDb, {
      customerId: lapsed.id,
      groupBookingPriority: true,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2021-01-01'),
    });

    const entry = await joinWaitlist({ departureId: departure.id, customerId: lapsed.id });
    expect(entry.priority).toBe(false);
  });

  it('reopens an existing entry instead of failing on the unique constraint', async () => {
    const departure = await makeDeparture({ capacity: 1 });
    const customer = await makeCustomer();

    const first = await joinWaitlist({ departureId: departure.id, customerId: customer.id });
    await testDb.groupWaitlistEntry.update({
      where: { id: first.id },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
    });

    const again = await joinWaitlist({
      departureId: departure.id,
      customerId: customer.id,
      requestedSeats: 2,
    });

    expect(again.id).toBe(first.id);
    expect(again.status).toBe('WAITING');
    expect(again.requestedSeats).toBe(2);
    expect(again.resolvedAt).toBeNull();
  });

  it('excludes converted and cancelled entries from the queue', async () => {
    const departure = await makeDeparture({ capacity: 1 });
    const a = await makeCustomer();
    const b = await makeCustomer();

    const entryA = await joinWaitlist({ departureId: departure.id, customerId: a.id });
    await joinWaitlist({ departureId: departure.id, customerId: b.id });
    await testDb.groupWaitlistEntry.update({
      where: { id: entryA.id },
      data: { status: 'CONVERTED' },
    });

    expect(await waitlistInOrder(departure.id)).toHaveLength(1);
  });
});

describe('roster', () => {
  it('lists named travellers where they exist', async () => {
    const departure = await makeDeparture({ capacity: 10 });
    const customer = await makeCustomer({ fullName: 'Lead Customer' });

    await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '800',
      groupAdventure: { departureId: departure.id, seats: 2 },
      travelers: [
        { fullName: 'Traveller One', passportNumber: 'A1', nationality: 'BH' },
        { fullName: 'Traveller Two', passportNumber: 'A2', type: 'CHILD' },
      ],
    });

    const roster = await departureRoster(departure.id);
    expect(roster).toHaveLength(2);
    expect(roster.map((r) => r.fullName)).toEqual(['Traveller One', 'Traveller Two']);
  });

  it('falls back to the lead customer when no travellers are named', async () => {
    // A booking holding seats must never be invisible to the tour leader.
    const departure = await makeDeparture({ capacity: 10 });
    const customer = await makeCustomer({
      fullName: 'Solo Traveller',
      passportNumber: 'P99',
    });

    await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '400',
      groupAdventure: { departureId: departure.id, seats: 1 },
    });

    const roster = await departureRoster(departure.id);
    expect(roster).toHaveLength(1);
    expect(roster[0]?.fullName).toBe('Solo Traveller');
    expect(roster[0]?.passportNumber).toBe('P99');
  });

  it('omits cancelled bookings', async () => {
    const departure = await makeDeparture({ capacity: 10 });
    const customer = await makeCustomer();

    const booking = await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '400',
      groupAdventure: { departureId: departure.id, seats: 1 },
    });
    await testDb.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });

    expect(await departureRoster(departure.id)).toHaveLength(0);
  });
});

describe('rosterToCsv', () => {
  it('starts with a BOM so Excel reads it as UTF-8', async () => {
    const departure = await makeDeparture({ capacity: 5 });
    const customer = await makeCustomer({ fullName: 'أحمد الخليفة' });
    await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '400',
      groupAdventure: { departureId: departure.id, seats: 1 },
    });

    const csv = rosterToCsv(await departureRoster(departure.id));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('أحمد الخليفة');
  });

  it('escapes quotes and commas so a comma in a name cannot break a column', () => {
    const csv = rosterToCsv([
      {
        bookingReference: 'VB-2026-000001',
        leadCustomer: 'Smith, John',
        fullName: 'He said "hello"',
        type: 'ADULT',
        phone: '+97333001122',
        nationality: 'BH',
        passportNumber: 'A1',
        passportExpiry: null,
        singleSupplement: true,
        seats: 1,
      },
    ]);

    expect(csv).toContain('"Smith, John"');
    expect(csv).toContain('"He said ""hello"""');
    expect(csv).toContain('"Yes"');
  });

  it('produces a header row even with no travellers', () => {
    const csv = rosterToCsv([]);
    expect(csv).toContain('"Passport number"');
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});
