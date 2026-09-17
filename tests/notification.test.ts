import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import { makeCustomer, makeDeparture, seedNotificationTemplates } from './helpers/factories';
import { createBooking, updateBookingStatus } from '@/server/services/booking.service';
import { issueMembership } from '@/server/services/membership.service';
import {
  enqueueBalanceReminder,
  enqueueMembershipRenewalReminder,
  normalisePhone,
  renderTemplate,
  waMeLink,
  whatsappNumberFor,
} from '@/server/services/notification.service';
import { dispatchPending, enqueueDueNotifications } from '@/server/services/dispatch.service';
import { ManualWhatsAppProvider } from '@/server/providers/whatsapp';
import type { SendResult, WhatsAppProvider } from '@/server/providers/whatsapp';

beforeEach(async () => {
  await resetDatabase();
  await seedNotificationTemplates();
});
afterAll(disconnect);

/** A provider that records what it was asked to send. */
function fakeProvider(outcome: (n: number) => SendResult): WhatsAppProvider & {
  calls: Array<{ toPhone: string; body: string; templateParameters: string[] }>;
} {
  const calls: Array<{ toPhone: string; body: string; templateParameters: string[] }> = [];
  return {
    name: 'fake',
    calls,
    async send(message) {
      calls.push({
        toPhone: message.toPhone,
        body: message.body,
        templateParameters: message.templateParameters,
      });
      return outcome(calls.length);
    },
  };
}

describe('normalisePhone', () => {
  it('strips formatting to E.164 digits', () => {
    expect(normalisePhone('+973 3300 1122')).toBe('97333001122');
    expect(normalisePhone('+973-3300-1122')).toBe('97333001122');
    expect(normalisePhone('0097333001122')).toBe('97333001122');
  });

  it('adds the Bahrain country code to a bare local mobile', () => {
    expect(normalisePhone('33001122')).toBe('97333001122');
    expect(normalisePhone('36001122')).toBe('97336001122');
  });

  it('leaves an explicit international number alone', () => {
    expect(normalisePhone('+441234567890')).toBe('441234567890');
  });

  it('rejects anything too short to be a number', () => {
    expect(normalisePhone('1234')).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('   ')).toBeNull();
  });
});

describe('whatsappNumberFor', () => {
  it('prefers the WhatsApp field and falls back to the phone', () => {
    expect(whatsappNumberFor({ phone: '+97333001122', whatsappPhone: '+97336009988' })).toBe(
      '97336009988',
    );
    expect(whatsappNumberFor({ phone: '+97333001122', whatsappPhone: null })).toBe(
      '97333001122',
    );
    expect(whatsappNumberFor({ phone: '+97333001122', whatsappPhone: '' })).toBe('97333001122');
  });
});

describe('renderTemplate', () => {
  it('substitutes named variables', () => {
    expect(renderTemplate('Hello {{name}}, ref {{ref}}.', { name: 'Ahmed', ref: 'VB-1' })).toBe(
      'Hello Ahmed, ref VB-1.',
    );
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('Hi {{ name }}', { name: 'Ahmed' })).toBe('Hi Ahmed');
  });

  it('leaves an unknown placeholder visible rather than printing "undefined"', () => {
    expect(renderTemplate('Hi {{missing}}', {})).toBe('Hi {{missing}}');
  });
});

describe('waMeLink', () => {
  it('builds a prefilled wa.me link', () => {
    const link = waMeLink('97333001122', 'Hello & welcome');
    expect(link).toBe('https://wa.me/97333001122?text=Hello%20%26%20welcome');
  });
});

describe('enqueue deduplication', () => {
  it('queues one confirmation per booking', async () => {
    const customer = await makeCustomer();
    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '500',
      status: 'CONFIRMED',
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    await updateBookingStatus({ bookingId: booking.id, status: 'TICKETED' });
    await updateBookingStatus({ bookingId: booking.id, status: 'CONFIRMED' });

    expect(
      await testDb.notificationOutbox.count({
        where: { bookingId: booking.id, event: 'BOOKING_CONFIRMED' },
      }),
    ).toBe(1);
  });

  it('queues one balance reminder per due date, and a new one if rescheduled', async () => {
    const customer = await makeCustomer();
    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '1000',
      depositType: 'PERCENT',
      depositValue: 30,
      balanceDueDate: new Date('2026-09-01'),
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    const balance = booking.scheduleItems.find((i) => i.kind === 'BALANCE')!;

    expect(await enqueueBalanceReminder(testDb, balance.id)).not.toBeNull();
    // Re-running the job the same day must not chase the customer twice.
    expect(await enqueueBalanceReminder(testDb, balance.id)).toBeNull();

    await testDb.paymentScheduleItem.update({
      where: { id: balance.id },
      data: { dueDate: new Date('2026-10-01') },
    });

    // A genuinely new due date is a new reminder.
    expect(await enqueueBalanceReminder(testDb, balance.id)).not.toBeNull();
  });

  it('does not remind about a balance that is already settled', async () => {
    const customer = await makeCustomer();
    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '1000',
      depositType: 'PERCENT',
      depositValue: 30,
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    const balance = booking.scheduleItems.find((i) => i.kind === 'BALANCE')!;
    await testDb.paymentScheduleItem.update({
      where: { id: balance.id },
      data: { paidAmount: balance.amountDue, status: 'PAID' },
    });

    expect(await enqueueBalanceReminder(testDb, balance.id)).toBeNull();
  });

  it('queues one renewal reminder per expiry date', async () => {
    const customer = await makeCustomer();
    const membership = await issueMembership(testDb, {
      customerId: customer.id,
      expiryDate: new Date('2026-12-31'),
    });

    expect(await enqueueMembershipRenewalReminder(testDb, membership.id)).not.toBeNull();
    expect(await enqueueMembershipRenewalReminder(testDb, membership.id)).toBeNull();
  });

  it('skips a customer with no usable phone number', async () => {
    const customer = await makeCustomer({ phone: '123', whatsappPhone: null });
    const booking = await createBooking({
      customerId: customer.id,
      type: 'VISA',
      sellingAmount: '100',
      status: 'CONFIRMED',
      visa: { destinationCountry: 'GE', visaType: 'Tourist' },
    });

    expect(await testDb.notificationOutbox.count({ where: { bookingId: booking.id } })).toBe(0);
  });
});

describe('capacity alerts', () => {
  it('alerts staff once per threshold, not once per seat', async () => {
    // Staff numbers come from the environment, which the test provides.
    vi.stubEnv('WHATSAPP_STAFF_NUMBERS', '+97333444555');
    const { resetEnvCache } = await import('@/lib/env');
    resetEnvCache();

    const departure = await makeDeparture({ capacity: 10 });

    for (const seats of [4, 4, 1, 1]) {
      const customer = await makeCustomer();
      await createBooking({
        customerId: customer.id,
        type: 'GROUP_ADVENTURE',
        sellingAmount: '400',
        groupAdventure: { departureId: departure.id, seats },
      });
    }

    const alerts = await testDb.notificationOutbox.findMany({
      where: { departureId: departure.id, event: 'GROUP_CAPACITY_ALERT' },
      orderBy: { createdAt: 'asc' },
    });

    // One at the 80% threshold, one at 100% — not one per booking.
    expect(alerts).toHaveLength(2);
    expect(alerts.every((a) => a.recipientType === 'STAFF')).toBe(true);

    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it('records the milestone even with no staff numbers configured', async () => {
    // Otherwise enabling staff numbers later would replay every past alert.
    const departure = await makeDeparture({ capacity: 2 });
    const customer = await makeCustomer();

    await createBooking({
      customerId: customer.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '800',
      groupAdventure: { departureId: departure.id, seats: 2 },
    });

    const after = await testDb.groupDeparture.findUniqueOrThrow({ where: { id: departure.id } });
    expect(after.lastCapacityAlertPercent).toBe(100);
    expect(
      await testDb.notificationOutbox.count({ where: { event: 'GROUP_CAPACITY_ALERT' } }),
    ).toBe(0);
  });
});

describe('dispatchPending', () => {
  async function queueOne() {
    const customer = await makeCustomer();
    return createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '500',
      status: 'CONFIRMED',
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });
  }

  it('marks a message sent and records the provider id', async () => {
    await queueOne();
    const provider = fakeProvider(() => ({
      status: 'SENT',
      provider: 'fake',
      providerMessageId: 'wamid.TEST',
    }));

    const result = await dispatchPending({ provider });
    expect(result.sent).toBe(1);

    const row = await testDb.notificationOutbox.findFirstOrThrow();
    expect(row.status).toBe('SENT');
    expect(row.providerMessageId).toBe('wamid.TEST');
    expect(row.deliveryStatus).toBe('ACCEPTED');
  });

  it('passes template parameters in the template’s declared order', async () => {
    await queueOne();
    const provider = fakeProvider(() => ({
      status: 'SENT',
      provider: 'fake',
      providerMessageId: null,
    }));

    await dispatchPending({ provider });

    // The seeded booking_confirmed template declares customerName first.
    const call = provider.calls[0]!;
    expect(call.templateParameters.length).toBeGreaterThan(0);
    expect(call.templateParameters[0]).toContain('Test Customer');
  });

  it('leaves a manual message pending so staff can still see it', async () => {
    await queueOne();
    const result = await dispatchPending({ provider: new ManualWhatsAppProvider() });

    expect(result.manual).toBe(1);
    const row = await testDb.notificationOutbox.findFirstOrThrow();
    expect(row.status).toBe('PENDING');
    expect(row.provider).toBe('manual');
  });

  it('retries a retryable failure and backs off', async () => {
    await queueOne();
    const provider = fakeProvider(() => ({
      status: 'FAILED',
      provider: 'fake',
      error: 'Rate limited',
      retryable: true,
    }));

    // Must be at or after the row's scheduledFor, which defaults to enqueue time.
    const now = new Date(Date.now() + 60_000);
    await dispatchPending({ provider, now });

    const row = await testDb.notificationOutbox.findFirstOrThrow();
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe('Rate limited');
    // Backed off into the future rather than retried immediately.
    expect(row.scheduledFor.getTime()).toBeGreaterThan(now.getTime());
  });

  it('gives up immediately on a non-retryable failure', async () => {
    await queueOne();
    const provider = fakeProvider(() => ({
      status: 'FAILED',
      provider: 'fake',
      error: 'No approved template',
      retryable: false,
    }));

    await dispatchPending({ provider });

    const row = await testDb.notificationOutbox.findFirstOrThrow();
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(1);
  });

  it('stops retrying after the attempt limit', async () => {
    await queueOne();
    const provider = fakeProvider(() => ({
      status: 'FAILED',
      provider: 'fake',
      error: 'Still failing',
      retryable: true,
    }));

    // Each run advances the clock past the back-off the previous one set;
    // reusing a single "now" would just re-skip the row every time.
    let now = new Date(Date.now() + 60_000);
    for (let i = 0; i < 6; i += 1) {
      await dispatchPending({ provider, now });
      now = new Date(now.getTime() + 24 * 60 * 60_000);
    }

    const row = await testDb.notificationOutbox.findFirstOrThrow();
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(5);
  });

  it('does not send a message scheduled for the future', async () => {
    await queueOne();
    await testDb.notificationOutbox.updateMany({
      data: { scheduledFor: new Date('2099-01-01T00:00:00Z') },
    });

    const provider = fakeProvider(() => ({
      status: 'SENT',
      provider: 'fake',
      providerMessageId: null,
    }));

    const result = await dispatchPending({ provider, now: new Date('2026-01-01T00:00:00Z') });
    expect(result.sent).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('sends nothing on a second run', async () => {
    await queueOne();
    const provider = fakeProvider(() => ({
      status: 'SENT',
      provider: 'fake',
      providerMessageId: null,
    }));

    await dispatchPending({ provider });
    const second = await dispatchPending({ provider });

    expect(second.sent).toBe(0);
    expect(provider.calls).toHaveLength(1);
  });
});

describe('enqueueDueNotifications', () => {
  it('expires lapsed memberships and queues what is due', async () => {
    const lapsed = await makeCustomer();
    await issueMembership(testDb, {
      customerId: lapsed.id,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2021-01-01'),
    });

    const result = await enqueueDueNotifications(new Date('2026-06-01T00:00:00Z'));
    expect(result.membershipsExpired).toBe(1);
  });

  it('is idempotent across runs on the same day', async () => {
    const customer = await makeCustomer();
    await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '1000',
      depositType: 'PERCENT',
      depositValue: 30,
      balanceDueDate: new Date('2026-06-03'),
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    const now = new Date('2026-06-01T09:00:00Z');
    const first = await enqueueDueNotifications(now);
    const second = await enqueueDueNotifications(now);

    expect(first.balanceRemindersQueued).toBe(1);
    expect(second.balanceRemindersQueued).toBe(0);
  });
});
