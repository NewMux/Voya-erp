import {
  BookingPaymentStatus,
  InvoiceStatus,
  ScheduleItemStatus,
  SupplierInvoiceStatus,
} from '@prisma/client';
import type { Db } from '@/lib/prisma';
import {
  add,
  gte,
  gt,
  isNegative,
  isPositive,
  isZero,
  roundMoney,
  subtract,
  toDecimal,
  toStorage,
} from '@/lib/money';
import { today } from '@/lib/dates';

/**
 * Payment roll-ups.
 *
 * Booking payment status, schedule-item status and invoice status are all
 * *derived* values that are denormalised onto their rows so lists can be sorted
 * and filtered in SQL. Nothing else in the codebase may set them directly —
 * every payment, refund or invoice write calls the matching recalc inside the
 * same transaction, so the stored value can never disagree with the payments
 * that produced it.
 */

/** Net cash received against a booking: allocations less processed refunds. */
export async function bookingNetPaid(db: Db, bookingId: string) {
  const [allocated, refunded] = await Promise.all([
    db.paymentAllocation.aggregate({
      where: { bookingId },
      _sum: { amount: true },
    }),
    db.refund.aggregate({
      // Only refunds that actually left the account reduce what the customer
      // has paid. Pending and rejected refunds must not.
      where: { bookingId, status: 'PROCESSED' },
      _sum: { amount: true },
    }),
  ]);

  return subtract(allocated._sum.amount ?? 0, refunded._sum.amount ?? 0);
}

/**
 * Spread a booking's payments across its schedule items.
 *
 * Allocations that name a schedule item are applied to it directly. Anything
 * left over is waterfalled across the remaining items in due order — deposit
 * first, then balance — which is how a walk-in payment with no instruction
 * should behave.
 */
export async function recalcScheduleItems(db: Db, bookingId: string): Promise<void> {
  const items = await db.paymentScheduleItem.findMany({
    where: { bookingId },
    orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }],
  });

  if (items.length === 0) return;

  const direct = await db.paymentAllocation.groupBy({
    by: ['scheduleItemId'],
    where: { bookingId, scheduleItemId: { not: null } },
    _sum: { amount: true },
  });

  const directById = new Map<string, ReturnType<typeof toDecimal>>();
  for (const row of direct) {
    if (row.scheduleItemId) {
      directById.set(row.scheduleItemId, toDecimal(row._sum.amount ?? 0));
    }
  }

  const totalNet = await bookingNetPaid(db, bookingId);
  const directTotal = add(...[...directById.values()]);
  // Refunds are netted here, so a refund can pull a schedule item back out of
  // PAID rather than leaving it stuck.
  let unassigned = subtract(totalNet, directTotal);
  if (isNegative(unassigned)) unassigned = toDecimal(0);

  for (const item of items) {
    // A waived or cancelled instalment is out of the waterfall entirely.
    if (item.status === ScheduleItemStatus.WAIVED || item.status === ScheduleItemStatus.CANCELLED) {
      continue;
    }

    const directPaid = directById.get(item.id) ?? toDecimal(0);
    const shortfall = subtract(item.amountDue, directPaid);
    let applied = directPaid;

    if (isPositive(shortfall) && isPositive(unassigned)) {
      const take = unassigned.gt(shortfall) ? shortfall : unassigned;
      applied = add(applied, take);
      unassigned = subtract(unassigned, take);
    }

    const paidAmount = roundMoney(applied);
    const status = isZero(paidAmount)
      ? ScheduleItemStatus.PENDING
      : gte(paidAmount, item.amountDue)
        ? ScheduleItemStatus.PAID
        : ScheduleItemStatus.PARTIALLY_PAID;

    if (!paidAmount.equals(toDecimal(item.paidAmount)) || status !== item.status) {
      await db.paymentScheduleItem.update({
        where: { id: item.id },
        data: { paidAmount: toStorage(paidAmount), status },
      });
    }
  }
}

/**
 * Roll a booking up to Unpaid / Deposit Paid / Fully Paid (PRD section 1.3).
 *
 * The PRD defines exactly three states, so any non-zero part payment reads as
 * "Deposit Paid" — including one that does not yet cover the full deposit. The
 * exact shortfall is visible on the schedule items.
 */
export async function recalcBookingPaymentStatus(
  db: Db,
  bookingId: string,
): Promise<BookingPaymentStatus> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, netSellingAmount: true, paymentStatus: true },
  });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  await recalcScheduleItems(db, bookingId);

  const netPaid = await bookingNetPaid(db, bookingId);
  const total = toDecimal(booking.netSellingAmount);

  let status: BookingPaymentStatus;
  if (!isPositive(netPaid)) {
    status = BookingPaymentStatus.UNPAID;
  } else if (gte(netPaid, total)) {
    // A zero-value booking with any payment on it is still fully paid.
    status = BookingPaymentStatus.FULLY_PAID;
  } else {
    status = BookingPaymentStatus.DEPOSIT_PAID;
  }

  if (status !== booking.paymentStatus) {
    await db.booking.update({ where: { id: bookingId }, data: { paymentStatus: status } });
  }

  return status;
}

/**
 * Roll an invoice up from its payments.
 *
 * DRAFT and CANCELLED are terminal for this purpose: an unsent invoice cannot
 * be overdue, and a cancelled one is not resurrected by a stray payment.
 */
export async function recalcInvoiceStatus(
  db: Db,
  invoiceId: string,
  now: Date = new Date(),
): Promise<InvoiceStatus> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, paidAmount: true, status: true, dueDate: true },
  });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const paidAgg = await db.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });
  const paid = roundMoney(paidAgg._sum.amount ?? 0);
  const total = toDecimal(invoice.total);

  let status = invoice.status;

  if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.DRAFT) {
    status = invoice.status;
  } else if (gt(total, 0) && gte(paid, total)) {
    status = InvoiceStatus.PAID;
  } else if (isPositive(paid)) {
    status = InvoiceStatus.PARTIALLY_PAID;
  } else if (invoice.dueDate.getTime() < today(now).getTime()) {
    status = InvoiceStatus.OVERDUE;
  } else {
    status = InvoiceStatus.SENT;
  }

  if (status !== invoice.status || !paid.equals(toDecimal(invoice.paidAmount))) {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status, paidAmount: toStorage(paid) },
    });
  }

  return status;
}

/** Roll a supplier invoice up from what we have paid against it. */
export async function recalcSupplierInvoiceStatus(
  db: Db,
  supplierInvoiceId: string,
): Promise<SupplierInvoiceStatus> {
  const invoice = await db.supplierInvoice.findUnique({
    where: { id: supplierInvoiceId },
    select: { id: true, amount: true, paidAmount: true, status: true },
  });
  if (!invoice) throw new Error(`Supplier invoice ${supplierInvoiceId} not found`);

  // A dispute is a human judgement about the bill, not a function of how much
  // has been paid, so it is never cleared automatically.
  if (invoice.status === SupplierInvoiceStatus.DISPUTED) return invoice.status;

  const paid = toDecimal(invoice.paidAmount);
  const amount = toDecimal(invoice.amount);

  const status = !isPositive(paid)
    ? SupplierInvoiceStatus.UNPAID
    : gte(paid, amount)
      ? SupplierInvoiceStatus.PAID
      : SupplierInvoiceStatus.PARTIALLY_PAID;

  if (status !== invoice.status) {
    await db.supplierInvoice.update({ where: { id: supplierInvoiceId }, data: { status } });
  }

  return status;
}

/** Everything a customer still owes, oldest due date first (PRD section 4.3). */
export async function outstandingScheduleItems(db: Db, opts: { customerId?: string } = {}) {
  return db.paymentScheduleItem.findMany({
    where: {
      status: { in: [ScheduleItemStatus.PENDING, ScheduleItemStatus.PARTIALLY_PAID] },
      booking: {
        status: { notIn: ['CANCELLED'] },
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
      },
    },
    orderBy: { dueDate: 'asc' },
    include: {
      booking: {
        select: {
          id: true,
          reference: true,
          type: true,
          customer: { select: { id: true, fullName: true, phone: true } },
        },
      },
    },
  });
}
