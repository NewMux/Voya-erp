import { prisma, type Db } from './prisma';

/**
 * Run work in a transaction, joining the caller's if there is one.
 *
 * Services need to be callable two ways: standalone (they open their own
 * transaction) and as a step inside a larger one (they must join it, or the
 * outer rollback would not undo their writes). Prisma's transaction client does
 * not expose `$transaction`, which is exactly the signal that we are already
 * inside one — nesting is not supported, so joining is the only correct move.
 */
export function inTransaction<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  return isTransaction(db) ? work(db) : prisma.$transaction((tx) => work(tx));
}

/** True when `db` is already a transaction client rather than the root client. */
export function isTransaction(db: Db): boolean {
  return !('$transaction' in db);
}
