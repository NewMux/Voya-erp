import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import {
  nextBookingReference,
  nextInvoiceNumber,
  nextMembershipNumber,
} from '@/server/services/reference.service';

beforeEach(resetDatabase);
afterAll(disconnect);

describe('membership numbers', () => {
  it('starts at VY-0000001 and increments', async () => {
    expect(await nextMembershipNumber(testDb)).toBe('VY-0000001');
    expect(await nextMembershipNumber(testDb)).toBe('VY-0000002');
    expect(await nextMembershipNumber(testDb)).toBe('VY-0000003');
  });

  it('pads to the PRD example width (VY-0001042)', async () => {
    await testDb.$executeRawUnsafe(`ALTER SEQUENCE membership_number_seq RESTART WITH 1042`);
    expect(await nextMembershipNumber(testDb)).toBe('VY-0001042');
  });

  it('never issues the same number twice under concurrency', async () => {
    // The reason sequences are used instead of count() + 1.
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => nextMembershipNumber(testDb)),
    );
    expect(new Set(numbers).size).toBe(25);
  });
});

describe('booking references', () => {
  it('is year-scoped and zero-padded', async () => {
    const ref = await nextBookingReference(testDb, new Date('2026-05-01T00:00:00Z'));
    expect(ref).toBe('VB-2026-000001');
  });

  it('restarts numbering when the year rolls over', async () => {
    expect(await nextBookingReference(testDb, new Date('2026-12-31T23:00:00Z'))).toBe(
      'VB-2026-000001',
    );
    expect(await nextBookingReference(testDb, new Date('2026-12-31T23:30:00Z'))).toBe(
      'VB-2026-000002',
    );
    expect(await nextBookingReference(testDb, new Date('2027-01-01T00:30:00Z'))).toBe(
      'VB-2027-000001',
    );
  });

  it('keeps counting within the new year after a rollover', async () => {
    await nextBookingReference(testDb, new Date('2026-06-01T00:00:00Z'));
    await nextBookingReference(testDb, new Date('2027-01-01T00:00:00Z'));
    expect(await nextBookingReference(testDb, new Date('2027-01-02T00:00:00Z'))).toBe(
      'VB-2027-000002',
    );
  });

  it('issues unique references under concurrency', async () => {
    const when = new Date('2026-03-03T00:00:00Z');
    const refs = await Promise.all(
      Array.from({ length: 20 }, () => nextBookingReference(testDb, when)),
    );
    expect(new Set(refs).size).toBe(20);
  });
});

describe('invoice numbers', () => {
  it('is year-scoped with the VOY prefix', async () => {
    expect(await nextInvoiceNumber(testDb, new Date('2026-02-01T00:00:00Z'))).toBe(
      'VOY-2026-000001',
    );
    expect(await nextInvoiceNumber(testDb, new Date('2026-02-02T00:00:00Z'))).toBe(
      'VOY-2026-000002',
    );
  });

  it('tracks its year independently of booking references', async () => {
    // Both use next_yearly_reference; a shared year row would corrupt both.
    await nextBookingReference(testDb, new Date('2026-01-01T00:00:00Z'));
    await nextBookingReference(testDb, new Date('2027-01-01T00:00:00Z'));

    expect(await nextInvoiceNumber(testDb, new Date('2026-06-01T00:00:00Z'))).toBe(
      'VOY-2026-000001',
    );
  });
});
