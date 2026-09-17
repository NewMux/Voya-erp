import { PrismaClient } from '@prisma/client';

/**
 * Integration-test database access.
 *
 * Tests run against a real Postgres because the behaviour that matters most
 * here — sequence allocation, `SELECT ... FOR UPDATE` seat locking, transaction
 * rollback — has no meaningful in-memory equivalent. Mocking it would test the
 * mock.
 */

export const testDb = new PrismaClient({ log: ['error'] });

/**
 * Truncate every application table between tests.
 *
 * RESTART IDENTITY is deliberately NOT used on the reference sequences: the
 * reset helper below handles those, because they live outside the tables.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await testDb.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'reference_sequence_years')
  `;

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }

  await resetReferenceSequences();
}

/** Put the reference sequences back to 1 so assertions can expect VY-0000001. */
export async function resetReferenceSequences(): Promise<void> {
  await testDb.$executeRawUnsafe(`ALTER SEQUENCE membership_number_seq RESTART WITH 1`);
  await testDb.$executeRawUnsafe(`ALTER SEQUENCE booking_reference_seq RESTART WITH 1`);
  await testDb.$executeRawUnsafe(`ALTER SEQUENCE invoice_number_seq RESTART WITH 1`);
  await testDb.$executeRawUnsafe(`DELETE FROM reference_sequence_years`);
}

export async function disconnect(): Promise<void> {
  await testDb.$disconnect();
}
