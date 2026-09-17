import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per process.
 *
 * Next.js reloads modules on every edit in development; without this cache each
 * reload would open a fresh connection pool until Postgres refused new clients.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** The transaction-scoped client type, for services that must join a caller's transaction. */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Accepts either the root client or an open transaction. */
export type Db = PrismaClient | PrismaTransaction;
