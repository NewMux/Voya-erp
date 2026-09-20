import { BookingStatus, type Prisma } from '@prisma/client';
import { prisma, type Db } from '@/lib/prisma';
import { add, subtract, toDecimal, toStorage } from '@/lib/money';
import { toDateOnly } from '@/lib/dates';

/**
 * Supplier rates, balances and reconciliation — PRD section 3.
 */

/**
 * The rate sheet in force for a supplier on a given date.
 *
 * Sheets are versioned and a booking snapshots the one it used, so historical
 * bookings keep the rate that applied. This resolves the *current* one for a
 * new booking; it is never used to re-derive an old booking's rate.
 */
export async function rateSheetInForce(
  db: Db,
  supplierId: string,
  onDate: Date = new Date(),
) {
  const date = toDateOnly(onDate);

  return db.supplierRateSheet.findFirst({
    where: {
      supplierId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    // Latest effective date wins when sheets overlap, then highest version.
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
  });
}

/** Next version number for a supplier's rate sheets. */
export async function nextRateSheetVersion(db: Db, supplierId: string): Promise<number> {
  const latest = await db.supplierRateSheet.findFirst({
    where: { supplierId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/**
 * What we still owe a supplier.
 *
 * Counted from supplier invoices where they exist, because that is the amount
 * actually billed. Bookings with a cost but no supplier invoice yet are
 * reported separately as "not yet invoiced", so the two are never conflated.
 */
export async function supplierBalance(db: Db, supplierId: string) {
  const [invoiced, bookingCosts, invoicedBookingIds] = await Promise.all([
    db.supplierInvoice.aggregate({
      where: { supplierId, status: { not: 'PAID' } },
      _sum: { amountBase: true, paidAmount: true },
    }),
    db.booking.aggregate({
      where: {
        supplierId,
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.INQUIRY] },
      },
      _sum: { costAmountBase: true },
    }),
    db.supplierInvoiceBooking.findMany({
      where: { supplierInvoice: { supplierId } },
      select: { bookingId: true },
    }),
  ]);

  const outstanding = subtract(
    invoiced._sum.amountBase ?? 0,
    invoiced._sum.paidAmount ?? 0,
  );

  const notYetInvoiced = await db.booking.aggregate({
    where: {
      supplierId,
      status: { notIn: [BookingStatus.CANCELLED, BookingStatus.INQUIRY] },
      id: { notIn: invoicedBookingIds.map((r) => r.bookingId) },
    },
    _sum: { costAmountBase: true },
  });

  return {
    outstanding: toStorage(outstanding.isNegative() ? 0 : outstanding),
    notYetInvoiced: toStorage(notYetInvoiced._sum.costAmountBase ?? 0),
    totalCostToDate: toStorage(bookingCosts._sum.costAmountBase ?? 0),
  };
}

/**
 * Bookings placed with a supplier in a date range (PRD section 3,
 * "Reconciliation"). Ranges are matched on travel date, which is what a
 * supplier's own statement is organised by.
 */
export async function supplierReconciliation(
  db: Db,
  input: { supplierId: string; from: Date; to: Date },
) {
  const bookings = await db.booking.findMany({
    where: {
      supplierId: input.supplierId,
      status: { not: BookingStatus.CANCELLED },
      departureDate: { gte: toDateOnly(input.from), lte: toDateOnly(input.to) },
    },
    orderBy: { departureDate: 'asc' },
    include: {
      customer: { select: { fullName: true } },
      supplierInvoices: { select: { supplierInvoiceId: true, amount: true } },
    },
  });

  const totalCost = add(...bookings.map((b) => b.costAmountBase));
  const matched = bookings.filter((b) => b.supplierInvoices.length > 0);

  return {
    bookings,
    totalCost: toStorage(totalCost),
    matchedCount: matched.length,
    unmatchedCount: bookings.length - matched.length,
  };
}

/** Commission earned on a booking, per the supplier's agreed structure. */
export function commissionFor(
  supplier: { commissionType: string; commissionValue: Prisma.Decimal | string },
  costAmountBase: Prisma.Decimal | string,
): string {
  switch (supplier.commissionType) {
    case 'FIXED_PERCENT':
      return toStorage(
        toDecimal(costAmountBase).times(toDecimal(supplier.commissionValue)).dividedBy(100),
      );
    case 'FIXED_AMOUNT':
      return toStorage(supplier.commissionValue);
    default:
      return toStorage(0);
  }
}

/** Suppliers with their outstanding balance, for the list page. */
export async function suppliersWithBalances(
  db: Db = prisma,
  where: Prisma.SupplierWhereInput = {},
) {
  const suppliers = await db.supplier.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { bookings: true, rateSheets: true } },
    },
  });

  // One aggregate per supplier would be N+1; group the invoice totals instead.
  const invoiceTotals = await db.supplierInvoice.groupBy({
    by: ['supplierId'],
    where: { status: { not: 'PAID' } },
    _sum: { amountBase: true, paidAmount: true },
  });

  const balanceBySupplier = new Map(
    invoiceTotals.map((row) => [
      row.supplierId,
      toStorage(subtract(row._sum.amountBase ?? 0, row._sum.paidAmount ?? 0)),
    ]),
  );

  return suppliers.map((supplier) => ({
    ...supplier,
    outstanding: balanceBySupplier.get(supplier.id) ?? toStorage(0),
  }));
}
