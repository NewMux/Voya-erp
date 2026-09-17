'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import {
  dateOnly,
  money,
  optionalMoney,
  optionalString,
  requiredString,
} from '@/lib/validation';
import {
  cancelInvoice,
  createInvoice,
  invoiceLinesFromBookings,
  recordPayment,
  recordRefund,
  sendInvoice,
  setRefundStatus,
  voidPayment,
} from '@/server/services/invoice.service';
import { parseForm, toActionState, type ActionState } from './types';

const invoiceSchema = z.object({
  customerId: requiredString('Customer'),
  issueDate: dateOnly,
  dueDate: dateOnly,
  language: z.enum(['EN', 'AR', 'BILINGUAL']),
  discountTotal: optionalMoney('Discount'),
  notes: optionalString,
  notesAr: optionalString,
  terms: optionalString,
  // Repeated fields arrive as a JSON payload, since FormData flattens arrays.
  lines: z.string().min(1, 'Add at least one line'),
});

const lineSchema = z.array(
  z.object({
    bookingId: z.string().nullable().optional(),
    description: z.string().trim().min(1),
    descriptionAr: z.string().nullable().optional(),
    quantity: z.union([z.string(), z.number()]).optional(),
    unitPrice: z.union([z.string(), z.number()]),
  }),
);

export async function createInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let invoiceId: string;

  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(invoiceSchema, formData);
    if (!parsed.success) return parsed.state;

    let lines;
    try {
      lines = lineSchema.parse(JSON.parse(parsed.data.lines));
    } catch {
      return { ok: false, error: 'The invoice lines could not be read. Please try again.' };
    }

    if (lines.length === 0) {
      return { ok: false, error: 'An invoice needs at least one line.' };
    }

    const invoice = await createInvoice({
      customerId: parsed.data.customerId,
      issueDate: parsed.data.issueDate,
      dueDate: parsed.data.dueDate,
      language: parsed.data.language,
      discountTotal: parsed.data.discountTotal ?? 0,
      notes: parsed.data.notes,
      notesAr: parsed.data.notesAr,
      terms: parsed.data.terms,
      createdById: user.id,
      lines: lines.map((line) => ({
        bookingId: line.bookingId ?? null,
        description: line.description,
        descriptionAr: line.descriptionAr ?? null,
        quantity: line.quantity ?? 1,
        unitPrice: line.unitPrice,
      })),
    });

    invoiceId = invoice.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${invoiceId}`);
}

export async function sendInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const id = String(formData.get('invoiceId') ?? '');
    if (!id) return { ok: false, error: 'Missing invoice.' };

    await sendInvoice(id);

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${id}`);
    return { ok: true, message: 'Invoice marked as sent.' };
  } catch (error) {
    return toActionState(error);
  }
}

export async function cancelInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const id = String(formData.get('invoiceId') ?? '');
    if (!id) return { ok: false, error: 'Missing invoice.' };

    await cancelInvoice(id);

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${id}`);
    return { ok: true, message: 'Invoice cancelled.' };
  } catch (error) {
    return toActionState(error);
  }
}

const paymentSchema = z.object({
  customerId: requiredString('Customer'),
  invoiceId: optionalString,
  bookingId: optionalString,
  scheduleItemId: optionalString,
  amount: money('Amount'),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'BENEFIT_PAY', 'OTHER']),
  reference: optionalString,
  paidAt: dateOnly,
  notes: optionalString,
});

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(paymentSchema, formData);
    if (!parsed.success) return parsed.state;

    const { bookingId, scheduleItemId, ...rest } = parsed.data;

    await recordPayment({
      ...rest,
      recordedById: user.id,
      allocations: bookingId
        ? [{ bookingId, scheduleItemId: scheduleItemId ?? null, amount: parsed.data.amount }]
        : [],
    });

    revalidatePath('/payments');
    if (bookingId) revalidatePath(`/bookings/${bookingId}`);
    if (parsed.data.invoiceId) revalidatePath(`/invoices/${parsed.data.invoiceId}`);
    return { ok: true, message: 'Payment recorded.' };
  } catch (error) {
    return toActionState(error);
  }
}

export async function voidPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    // Voiding rewrites financial history, so it is admin-only.
    await assertRole('ADMIN');

    const id = String(formData.get('paymentId') ?? '');
    if (!id) return { ok: false, error: 'Missing payment.' };

    await voidPayment(id);

    revalidatePath('/payments');
    return { ok: true, message: 'Payment voided.' };
  } catch (error) {
    return toActionState(error);
  }
}

const refundSchema = z.object({
  bookingId: requiredString('Booking'),
  amount: money('Amount'),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'BENEFIT_PAY', 'OTHER']),
  reason: optionalString,
  reference: optionalString,
  status: z.enum(['PENDING', 'PROCESSED']),
});

export async function recordRefundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(refundSchema, formData);
    if (!parsed.success) return parsed.state;

    await recordRefund({ ...parsed.data, recordedById: user.id });

    revalidatePath(`/bookings/${parsed.data.bookingId}`);
    revalidatePath('/payments');
    return { ok: true, message: 'Refund recorded.' };
  } catch (error) {
    return toActionState(error);
  }
}

const refundStatusSchema = z.object({
  refundId: requiredString('Refund'),
  status: z.enum(['PENDING', 'PROCESSED', 'REJECTED']),
});

export async function setRefundStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(refundStatusSchema, formData);
    if (!parsed.success) return parsed.state;

    const refund = await setRefundStatus(parsed.data);

    revalidatePath(`/bookings/${refund.bookingId}`);
    revalidatePath('/payments');
    return { ok: true, message: 'Refund updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** Unpaid bookings for a customer, to populate the invoice builder. */
export async function bookingsForInvoice(customerId: string) {
  await assertRole('ADMIN', 'ACCOUNTANT');

  const bookings = await prisma.booking.findMany({
    where: {
      customerId,
      status: { notIn: ['CANCELLED'] },
      // A booking already fully invoiced should not be offered again.
      invoiceLines: { none: {} },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      flightDetail: true,
      hotelDetail: true,
      visaDetail: true,
      transportDetail: true,
      groupDetail: { include: { departure: true } },
    },
  });

  const lines = await invoiceLinesFromBookings(bookings.map((b) => b.id));

  return bookings.map((booking) => ({
    id: booking.id,
    reference: booking.reference,
    type: booking.type,
    netSellingAmount: booking.netSellingAmount.toString(),
    description: lines.find((line) => line.bookingId === booking.id)?.description ?? booking.reference,
  }));
}
