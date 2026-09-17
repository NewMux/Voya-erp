import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import { makeCustomer } from './helpers/factories';
import {
  canonicalMembershipNumber,
  looksLikeMembershipNumber,
  searchCustomers,
} from '@/server/services/customer.service';
import {
  activeBenefitFor,
  expireLapsedMemberships,
  issueMembership,
  membershipsDueForRenewal,
  renewMembership,
  resolveMembershipDiscount,
} from '@/server/services/membership.service';

beforeEach(resetDatabase);
afterAll(disconnect);

describe('membership number parsing', () => {
  it('recognises the shapes staff actually type', () => {
    expect(looksLikeMembershipNumber('VY-0001042')).toBe(true);
    expect(looksLikeMembershipNumber('vy1042')).toBe(true);
    expect(looksLikeMembershipNumber('1042')).toBe(true);
    expect(looksLikeMembershipNumber('Ahmed')).toBe(false);
    expect(looksLikeMembershipNumber('+97333001122')).toBe(false);
  });

  it('canonicalises all of them to the same number', () => {
    expect(canonicalMembershipNumber('1042')).toBe('VY-0001042');
    expect(canonicalMembershipNumber('vy1042')).toBe('VY-0001042');
    expect(canonicalMembershipNumber('VY-0001042')).toBe('VY-0001042');
  });
});

describe('searchCustomers', () => {
  it('returns the exact member when given a membership number', async () => {
    const member = await makeCustomer({ fullName: 'Member One' });
    await makeCustomer({ fullName: 'Member Two' });
    await issueMembership(testDb, { customerId: member.id });

    const results = await searchCustomers('VY-0000001');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(member.id);
  });

  it('accepts a bare membership number without the prefix', async () => {
    const member = await makeCustomer();
    await issueMembership(testDb, { customerId: member.id });

    const results = await searchCustomers('1');
    expect(results[0]?.id).toBe(member.id);
  });

  it('matches names case-insensitively and partially', async () => {
    await makeCustomer({ fullName: 'Ahmed Al Khalifa' });
    const results = await searchCustomers('khalifa');
    expect(results).toHaveLength(1);
  });

  it('matches a phone number regardless of formatting', async () => {
    // Staff paste numbers from WhatsApp in every shape imaginable.
    await makeCustomer({ fullName: 'Phone Person', phone: '+973 3300 1122' });

    for (const query of ['97333001122', '+97333001122', '33001122', '3300 1122']) {
      const results = await searchCustomers(query);
      expect(results.map((c) => c.fullName)).toContain('Phone Person');
    }
  });

  it('finds a customer by passport number', async () => {
    await makeCustomer({ fullName: 'Passport Person', passportNumber: 'A1234567' });
    const results = await searchCustomers('A1234567');
    expect(results[0]?.fullName).toBe('Passport Person');
  });

  it('returns recent customers for an empty query', async () => {
    await makeCustomer();
    await makeCustomer();
    expect(await searchCustomers('')).toHaveLength(2);
  });

  it('returns nothing for a query that matches nothing', async () => {
    await makeCustomer({ fullName: 'Someone' });
    expect(await searchCustomers('zzzznomatch')).toHaveLength(0);
  });
});

describe('membership lifecycle', () => {
  it('defaults to a one-year period ending the day before the anniversary', async () => {
    const customer = await makeCustomer();
    const membership = await issueMembership(testDb, {
      customerId: customer.id,
      startDate: new Date('2026-01-01'),
    });

    expect(membership.expiryDate.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('rejects an expiry before the start date', async () => {
    const customer = await makeCustomer();
    await expect(
      issueMembership(testDb, {
        customerId: customer.id,
        startDate: new Date('2026-06-01'),
        expiryDate: new Date('2026-01-01'),
      }),
    ).rejects.toThrow(/expiry date cannot be before/i);
  });

  it('extends from the current expiry when renewed early', async () => {
    // Renewing early must not cost the member the remaining days.
    const customer = await makeCustomer();
    const membership = await issueMembership(testDb, {
      customerId: customer.id,
      startDate: new Date('2026-01-01'),
      expiryDate: new Date('2099-12-31'),
    });

    const renewed = await renewMembership(testDb, {
      membershipId: membership.id,
      amount: '25',
    });

    // New period starts the day after the old expiry, so it ends a year later.
    expect(renewed.expiryDate.toISOString().slice(0, 10)).toBe('2100-12-31');
  });

  it('records a renewal row per period', async () => {
    const customer = await makeCustomer();
    const membership = await issueMembership(testDb, { customerId: customer.id });
    await renewMembership(testDb, { membershipId: membership.id, amount: '25' });

    const renewals = await testDb.membershipRenewal.findMany({
      where: { membershipId: membership.id },
    });
    expect(renewals).toHaveLength(1);
    expect(renewals[0]?.amount.toString()).toBe('25');
  });

  it('reactivates an expired membership on renewal', async () => {
    const customer = await makeCustomer();
    const membership = await issueMembership(testDb, {
      customerId: customer.id,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2021-01-01'),
    });
    await expireLapsedMemberships(testDb);

    const renewed = await renewMembership(testDb, {
      membershipId: membership.id,
      amount: '25',
    });
    expect(renewed.status).toBe('ACTIVE');
  });
});

describe('activeBenefitFor', () => {
  it('returns the benefit for a current membership', async () => {
    const customer = await makeCustomer();
    await issueMembership(testDb, {
      customerId: customer.id,
      discountPercent: 10,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2099-12-31'),
    });

    const benefit = await activeBenefitFor(testDb, customer.id);
    expect(benefit?.discountPercent).toBe('10');
    expect(benefit?.groupBookingPriority).toBe(true);
  });

  it('returns null for a membership that has not started yet', async () => {
    const customer = await makeCustomer();
    await issueMembership(testDb, {
      customerId: customer.id,
      startDate: new Date('2099-01-01'),
      expiryDate: new Date('2099-12-31'),
    });

    expect(await activeBenefitFor(testDb, customer.id)).toBeNull();
  });

  it('returns null once expired, even before the cron marks it', async () => {
    // The status flag can lag; the date is the source of truth.
    const customer = await makeCustomer();
    await issueMembership(testDb, {
      customerId: customer.id,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2021-01-01'),
    });

    const membership = await testDb.membership.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    expect(membership.status).toBe('ACTIVE');
    expect(await activeBenefitFor(testDb, customer.id)).toBeNull();
  });

  it('returns null for a cancelled membership', async () => {
    const customer = await makeCustomer();
    const membership = await issueMembership(testDb, {
      customerId: customer.id,
      expiryDate: new Date('2099-12-31'),
    });
    await testDb.membership.update({
      where: { id: membership.id },
      data: { status: 'CANCELLED' },
    });

    expect(await activeBenefitFor(testDb, customer.id)).toBeNull();
  });

  it('returns null for a customer with no membership', async () => {
    const customer = await makeCustomer();
    expect(await activeBenefitFor(testDb, customer.id)).toBeNull();
  });
});

describe('resolveMembershipDiscount', () => {
  it('is zero without a benefit', () => {
    expect(resolveMembershipDiscount('500', null)).toEqual({
      percent: '0.00',
      amount: '0.000',
    });
  });

  it('is zero for a member on a zero-percent tier', () => {
    const result = resolveMembershipDiscount('500', {
      membershipId: 'm',
      membershipNumber: 'VY-0000001',
      tier: 'VOYAGEUR',
      discountPercent: '0',
      groupBookingPriority: true,
    });
    expect(result.amount).toBe('0.000');
  });

  it('resolves a percentage to a BHD amount', () => {
    const result = resolveMembershipDiscount('500', {
      membershipId: 'm',
      membershipNumber: 'VY-0000001',
      tier: 'VOYAGEUR',
      discountPercent: '10',
      groupBookingPriority: true,
    });
    expect(result).toEqual({ percent: '10.00', amount: '50.000' });
  });
});

describe('expiry sweep and renewal reminders', () => {
  it('marks only memberships whose expiry has passed', async () => {
    const lapsed = await makeCustomer();
    const current = await makeCustomer();

    await issueMembership(testDb, {
      customerId: lapsed.id,
      startDate: new Date('2020-01-01'),
      expiryDate: new Date('2021-01-01'),
    });
    await issueMembership(testDb, {
      customerId: current.id,
      expiryDate: new Date('2099-12-31'),
    });

    expect(await expireLapsedMemberships(testDb)).toBe(1);
    expect(await testDb.membership.count({ where: { status: 'EXPIRED' } })).toBe(1);
    expect(await testDb.membership.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });

  it('lists memberships expiring inside the reminder window', async () => {
    const soon = await makeCustomer();
    const later = await makeCustomer();
    const now = new Date('2026-06-01T00:00:00Z');

    await issueMembership(testDb, {
      customerId: soon.id,
      startDate: new Date('2025-06-15'),
      expiryDate: new Date('2026-06-15'),
    });
    await issueMembership(testDb, {
      customerId: later.id,
      startDate: new Date('2025-12-01'),
      expiryDate: new Date('2026-12-01'),
    });

    const due = await membershipsDueForRenewal(testDb, 30, now);
    expect(due).toHaveLength(1);
    expect(due[0]?.customerId).toBe(soon.id);
  });
});
