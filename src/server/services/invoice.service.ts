import { InvoiceStatus, type Currency, type PaymentMethod } from '@prisma/client';
import { prisma, type Db } from '@/lib/prisma';
import { inTransaction } from '@/lib/tx';
import { add, isPositive, subtract, toDecimal, toStorage } from '@/lib/money';
import { addDays, toDateOnly, today } from '@/lib/dates';
import { nextInvoiceNumber } from './reference.service';
import { recalcBookingPaymentStatus, recalcInvoiceStatus } from './payment.service';

/**
 * Invoicing, payments and refunds — PRD section 4.
 *
 * Every write that can change what a customer owes runs inside a transaction
 * that also re-derives the affected roll-ups, so a booking's payment status and
 * an invoice's status can never disagree with the payments beneath them.
 */

export type InvoiceLineInput = {
  bookingId?: string | null;
  description: string;
  descriptionAr?: string | null;
  quantity?: string | number;
  unitPrice: string | number;
};

/**
 * Create an invoice, optionally bundling several bookings for one customer.
 *
 * The number comes from a yearly sequence inside the same transaction as the
 * insert, so concurrent saves cannot collide.
 */
export async function createInvoice(
  input: {
    customerId: string;
    issueDate?: Date;
    dueDate?: Date;
    language?: 'EN' | 'AR' | 'BILINGUAL';
    lines: InvoiceLineInput[];
    discountTotal?: string | number;
    notes?: string | null;
    notesAr?: string | null;
    terms?: string | null;
    createdById?: string | null;
    status?: InvoiceStatus;
  },
  db: Db = prisma,
) {
  const run = async (tx: Db) => {
    if (input.lines.length === 0) {
      throw new Error('An invoice needs at least one line.');
    }

    const now = new Date();
    const issueDate = toDateOnly(input.issueDate ?? now);
    // Default to 14 days' credit when no due date is chosen.
    const dueDate = toDateOnly(input.dueDate ?? addDays(issueDate, 14));

    if (dueDate.getTime() < issueDate.getTime()) {
      throw new Error('The due date cannot be before the issue date.');
    }

    const lines = input.lines.map((line, index) => {
      const quantity = toDecimal(line.quantity ?? 1);
      const unitPrice = toDecimal(line.unitPrice);
      return {
        bookingId: line.bookingId ?? null,
        description: line.description,
        descriptionAr: line.descriptionAr ?? null,
        quantity: quantity.toFixed(2),
        unitPrice: toStorage(unitPrice),
        lineTotal: toStorage(quantity.times(unitPrice)),
        sortOrder: index,
      };
    });

    const subtotal = add(...lines.map((line) => line.lineTotal));
    const discountTotal = toDecimal(input.discountTotal ?? 0);

    if (discountTotal.gt(subtotal)) {
      throw new Error('The discount cannot exceed the invoice subtotal.');
    }

    const number = await nextInvoiceNumber(tx, now);

    return tx.invoice.create({
      data: {
        number,
        customerId: input.customerId,
        issueDate,
        dueDate,
        language: input.language ?? 'EN',
        status: input.status ?? InvoiceStatus.DRAFT,
        subtotal: toStorage(subtotal),
        discountTotal: toStorage(discountTotal),
        total: toStorage(subtract(subtotal, discountTotal)),
        notes: input.notes ?? null,
        notesAr: input.notesAr ?? null,
        terms: input.terms ?? null,
        createdById: input.createdById ?? null,
        lines: { create: lines },
      },
      include: { lines: true, customer: true },
    });
  };

  return inTransaction(db, run);
}

/** Mark an invoice as sent, which is what makes it eligible to go overdue. */
export async function sendInvoice(invoiceId: string, db: Db = prisma) {
  const run = async (tx: Db) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error('A cancelled invoice cannot be sent.');
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.SENT, sentAt: new Date() },
    });

    // Re-derive immediately: an invoice sent after its due date is overdue now.
    return recalcInvoiceStatus(tx, invoiceId);
  };

  return inTransaction(db, run);
}

export async function cancelInvoice(invoiceId: string, db: Db = prisma) {
  const paid = await db.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });

  if (isPositive(paid._sum.amount ?? 0)) {
    throw new Error('This invoice has payments against it and cannot be cancelled.');
  }

  return db.invoice.update({
    where: { id: invoiceId },
    data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date() },
  });
}

export type PaymentAllocationInput = {
  bookingId: string;
  scheduleItemId?: string | null;
  amount: string | number;
};

/**
 * Record money received.
 *
 * Allocations attribute the payment to bookings — without them, a payment
 * against an invoice bundling three bookings could not be traced to any of
 * them. Every booking touched, and the invoice if there is one, is re-derived
 * inside the same transaction.
 */
export async function recordPayment(
  input: {
    customerId: string;
    invoiceId?: string | null;
    membershipId?: string | null;
    amount: string | number;
    currency?: Currency;
    method: PaymentMethod;
    reference?: string | null;
    paidAt?: Date;
    notes?: string | null;
    recordedById?: string | null;
    allocations?: PaymentAllocationInput[];
  },
  db: Db = prisma,
) {
  const run = async (tx: Db) => {
    const amount = toDecimal(input.amount);
    if (!isPositive(amount)) {
      throw new Error('A payment must be greater than zero.');
    }

    const allocations = input.allocations ?? [];
    const allocatedTotal = add(...allocations.map((a) => a.amount));

    if (allocatedTotal.gt(amount)) {
      throw new Error('Allocations cannot exceed the payment amount.');
    }

    const payment = await tx.payment.create({
      data: {
        customerId: input.customerId,
        invoiceId: input.invoiceId ?? null,
        membershipId: input.membershipId ?? null,
        amount: toStorage(amount),
        currency: input.currency ?? 'BHD',
        method: input.method,
        reference: input.reference ?? null,
        paidAt: input.paidAt ?? new Date(),
        notes: input.notes ?? null,
        recordedById: input.recordedById ?? null,
        allocations: {
          create: allocations.map((allocation) => ({
            bookingId: allocation.bookingId,
            scheduleItemId: allocation.scheduleItemId ?? null,
            amount: toStorage(allocation.amount),
          })),
        },
      },
      include: { allocations: true },
    });

    for (const bookingId of new Set(allocations.map((a) => a.bookingId))) {
      await recalcBookingPaymentStatus(tx, bookingId);
    }

    if (input.invoiceId) {
      await recalcInvoiceStatus(tx, input.invoiceId);
    }

    return payment;
  };

  return inTransaction(db, run);
}

/** Remove a payment recorded in error, re-deriving everything it touched. */
export async function voidPayment(paymentId: string, db: Db = prisma) {
  const run = async (tx: Db) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });
    if (!payment) throw new Error('Payment not found.');

    const bookingIds = [...new Set(payment.allocations.map((a) => a.bookingId))];

    await tx.payment.delete({ where: { id: paymentId } });

    for (const bookingId of bookingIds) {
      await recalcBookingPaymentStatus(tx, bookingId);
    }
    if (payment.invoiceId) {
      await recalcInvoiceStatus(tx, payment.invoiceId);
    }
  };

  return inTransaction(db, run);
}

/**
 * Record a refund against a booking (PRD section 4.3).
 *
 * Only a PROCESSED refund reduces what the customer has paid, so raising one
 * for approval does not immediately flip a booking out of Fully Paid.
 */
export async function recordRefund(
  input: {
    bookingId: string;
    paymentId?: string | null;
    amount: string | number;
    method?: PaymentMethod;
    reason?: string | null;
    reference?: string | null;
    status?: 'PENDING' | 'PROCESSED' | 'REJECTED';
    recordedById?: string | null;
  },
  db: Db = prisma,
) {
  const run = async (tx: Db) => {
    const amount = toDecimal(input.amount);
    if (!isPositive(amount)) {
      throw new Error('A refund must be greater than zero.');
    }

    const status = input.status ?? 'PENDING';

    const refund = await tx.refund.create({
      data: {
        bookingId: input.bookingId,
        paymentId: input.paymentId ?? null,
        amount: toStorage(amount),
        method: input.method ?? 'BANK_TRANSFER',
        reason: input.reason ?? null,
        reference: input.reference ?? null,
        status,
        processedAt: status === 'PROCESSED' ? new Date() : null,
        recordedById: input.recordedById ?? null,
      },
    });

    await recalcBookingPaymentStatus(tx, input.bookingId);
    return refund;
  };

  return inTransaction(db, run);
}

/** Move a refund to processed or rejected, re-deriving the booking. */
export async function setRefundStatus(
  input: { refundId: string; status: 'PENDING' | 'PROCESSED' | 'REJECTED' },
  db: Db = prisma,
) {
  const run = async (tx: Db) => {
    const refund = await tx.refund.update({
      where: { id: input.refundId },
      data: {
        status: input.status,
        processedAt: input.status === 'PROCESSED' ? new Date() : null,
      },
    });

    await recalcBookingPaymentStatus(tx, refund.bookingId);
    return refund;
  };

  return inTransaction(db, run);
}

/**
 * Mark sent invoices past their due date as overdue.
 *
 * Run by the cron route. Statuses are stored rather than computed on read so
 * the list view can filter and sort on them in SQL.
 */
export async function markOverdueInvoices(db: Db = prisma, now: Date = new Date()) {
  const result = await db.invoice.updateMany({
    where: {
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
      dueDate: { lt: today(now) },
    },
    data: { status: InvoiceStatus.OVERDUE },
  });
  return result.count;
}

/** Everything unpaid, oldest due date first (PRD section 4.3). */
export async function outstandingInvoices(db: Db = prisma) {
  return db.invoice.findMany({
    where: {
      status: {
        in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
      },
    },
    orderBy: { dueDate: 'asc' },
    include: { customer: { select: { id: true, fullName: true, phone: true } } },
  });
}

/** Suggest invoice lines from a set of bookings. */
export async function invoiceLinesFromBookings(bookingIds: string[], db: Db = prisma) {
  const bookings = await db.booking.findMany({
    where: { id: { in: bookingIds } },
    include: {
      flightDetail: true,
      hotelDetail: true,
      visaDetail: true,
      transportDetail: true,
      groupDetail: { include: { departure: true } },
    },
  });

  return bookings.map((booking) => {
    let description = `${booking.reference}`;

    if (booking.flightDetail) {
      description += ` — Flight ${booking.flightDetail.routeFrom} to ${booking.flightDetail.routeTo}, ${booking.flightDetail.airline}`;
    } else if (booking.hotelDetail) {
      description += ` — ${booking.hotelDetail.propertyName}${
        booking.hotelDetail.city ? `, ${booking.hotelDetail.city}` : ''
      }`;
    } else if (booking.visaDetail) {
      description += ` — ${booking.visaDetail.visaType} visa, ${booking.visaDetail.destinationCountry}`;
    } else if (booking.transportDetail) {
      description += ` — Transport from ${booking.transportDetail.pickupLocation}`;
    } else if (booking.groupDetail) {
      description += ` — ${booking.groupDetail.departure.name}, ${booking.groupDetail.seats} seat${
        booking.groupDetail.seats === 1 ? '' : 's'
      }`;
    } else {
      description += ' — Travel package';
    }

    return {
      bookingId: booking.id,
      description,
      quantity: 1,
      // The net amount: the customer's member discount is already applied, and
      // cost price never appears on a customer document.
      unitPrice: booking.netSellingAmount.toString(),
    };
  });
}
