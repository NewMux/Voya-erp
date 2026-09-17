import type { Db } from '@/lib/prisma';

/**
 * Human-facing reference numbers.
 *
 * All three read from Postgres sequences created in the
 * `20260917043000_reference_sequences` migration. Sequences are used instead of
 * `count() + 1` because the latter races: two staff saving at the same instant
 * would compute the same number and one insert would fail on the unique index.
 *
 * Because nextval() ignores transaction rollback, an abandoned booking burns a
 * number and leaves a gap. Gaps are harmless; duplicates are not.
 */

function pad(value: bigint | number, width: number): string {
  return value.toString().padStart(width, '0');
}

/** Reads a scalar from a sequence helper, tolerating bigint or string results. */
async function readSequence(db: Db, sql: Promise<Array<Record<string, unknown>>>): Promise<bigint> {
  const rows = await sql;
  const first = rows[0];
  if (!first) throw new Error('Sequence query returned no rows');
  const value = Object.values(first)[0];
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  throw new Error(`Unexpected sequence value: ${String(value)}`);
}

/**
 * Membership numbers never reset — a member keeps their number for life, and
 * the PRD's example (VY-0001042) is a running total, not a yearly one.
 */
export async function nextMembershipNumber(db: Db): Promise<string> {
  const value = await readSequence(
    db,
    db.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('membership_number_seq')`,
  );
  return `VY-${pad(value, 7)}`;
}

/** Booking references restart each calendar year: VB-2026-000001. */
export async function nextBookingReference(db: Db, now: Date = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const value = await readSequence(
    db,
    db.$queryRaw<Array<{ next_yearly_reference: bigint }>>`
      SELECT next_yearly_reference('booking_reference_seq', ${year}::integer)
    `,
  );
  return `VB-${year}-${pad(value, 6)}`;
}

/** Invoice numbers restart each calendar year: VOY-2026-000001. */
export async function nextInvoiceNumber(db: Db, now: Date = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const value = await readSequence(
    db,
    db.$queryRaw<Array<{ next_yearly_reference: bigint }>>`
      SELECT next_yearly_reference('invoice_number_seq', ${year}::integer)
    `,
  );
  return `VOY-${year}-${pad(value, 6)}`;
}
