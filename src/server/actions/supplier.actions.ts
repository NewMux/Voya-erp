'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import {
  currency,
  dateOnly,
  fxRate,
  money,
  optionalDateOnly,
  optionalEmail,
  optionalPhone,
  optionalString,
  requiredString,
} from '@/lib/validation';
import { add, convertToBase, toStorage } from '@/lib/money';
import { nextRateSheetVersion } from '@/server/services/supplier.service';
import { recalcSupplierInvoiceStatus } from '@/server/services/payment.service';
import { parseForm, toActionState, type ActionState } from './types';

const supplierSchema = z.object({
  name: requiredString('Supplier name'),
  type: z.enum(['AIRLINE', 'HOTEL', 'DMC', 'TRANSPORT', 'VISA_AGENT']),
  contactName: optionalString,
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  country: optionalString,
  paymentTerms: z.enum(['PREPAID', 'CREDIT']),
  creditDays: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v === null || /^\d+$/.test(v), 'Credit days must be a whole number')
    .transform((v) => (v === null ? null : Number.parseInt(v, 10))),
  commissionType: z.enum(['NONE', 'FIXED_PERCENT', 'FIXED_AMOUNT']),
  commissionValue: z
    .string()
    .trim()
    .transform((v) => (v === '' ? '0' : v))
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), 'Commission must be a number'),
  defaultCurrency: currency,
  notes: optionalString,
});

/** Credit days are only meaningful on credit terms; drop them otherwise. */
function normaliseTerms(data: z.infer<typeof supplierSchema>) {
  return {
    ...data,
    creditDays: data.paymentTerms === 'CREDIT' ? data.creditDays : null,
    commissionValue:
      data.commissionType === 'NONE' ? toStorage(0) : toStorage(data.commissionValue),
  };
}

export async function createSupplier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let supplierId: string;

  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(supplierSchema, formData);
    if (!parsed.success) return parsed.state;

    if (parsed.data.paymentTerms === 'CREDIT' && !parsed.data.creditDays) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { creditDays: 'Credit terms need a credit period in days' },
      };
    }

    const supplier = await prisma.supplier.create({ data: normaliseTerms(parsed.data) });
    supplierId = supplier.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/suppliers');
  redirect(`/suppliers/${supplierId}`);
}

export async function updateSupplier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, error: 'Missing supplier id.' };

    const parsed = parseForm(supplierSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.supplier.update({ where: { id }, data: normaliseTerms(parsed.data) });

    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
    return { ok: true, message: 'Supplier updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

export async function toggleSupplierActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const id = String(formData.get('id') ?? '');
    const supplier = await prisma.supplier.findUnique({ where: { id }, select: { isActive: true } });
    if (!supplier) return { ok: false, error: 'Supplier not found.' };

    await prisma.supplier.update({ where: { id }, data: { isActive: !supplier.isActive } });

    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
    return { ok: true, message: supplier.isActive ? 'Supplier archived.' : 'Supplier restored.' };
  } catch (error) {
    return toActionState(error);
  }
}

const rateSheetSchema = z.object({
  supplierId: requiredString('Supplier'),
  name: requiredString('Rate sheet name'),
  effectiveFrom: dateOnly,
  effectiveTo: optionalDateOnly,
  currency,
  notes: optionalString,
});

/**
 * Add a rate sheet version.
 *
 * Creating a new open-ended sheet closes the previous one the day before it
 * starts, so the two never overlap and `rateSheetInForce` has a single answer.
 */
export async function createRateSheet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(rateSheetSchema, formData);
    if (!parsed.success) return parsed.state;

    const { supplierId, effectiveFrom, effectiveTo } = parsed.data;

    if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { effectiveTo: 'The end date cannot be before the start date' },
      };
    }

    await prisma.$transaction(async (tx) => {
      const previousDay = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);

      await tx.supplierRateSheet.updateMany({
        where: { supplierId, effectiveTo: null, effectiveFrom: { lt: effectiveFrom } },
        data: { effectiveTo: previousDay },
      });

      await tx.supplierRateSheet.create({
        data: {
          ...parsed.data,
          version: await nextRateSheetVersion(tx, supplierId),
        },
      });
    });

    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: 'Rate sheet added.' };
  } catch (error) {
    return toActionState(error);
  }
}

const supplierInvoiceSchema = z.object({
  supplierId: requiredString('Supplier'),
  reference: requiredString('Invoice reference'),
  issueDate: dateOnly,
  dueDate: optionalDateOnly,
  amount: money('Amount'),
  currency,
  fxRate,
  notes: optionalString,
});

/** Record an invoice received from a supplier. */
export async function createSupplierInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(supplierInvoiceSchema, formData);
    if (!parsed.success) return parsed.state;

    const { fxRate: rate, amount, ...rest } = parsed.data;

    await prisma.supplierInvoice.create({
      data: {
        ...rest,
        amount: toStorage(amount, parsed.data.currency),
        fxRate: rate,
        amountBase: toStorage(convertToBase(amount, rate)),
      },
    });

    revalidatePath(`/suppliers/${parsed.data.supplierId}`);
    return { ok: true, message: 'Supplier invoice recorded.' };
  } catch (error) {
    return toActionState(error);
  }
}

const supplierPaymentSchema = z.object({
  supplierInvoiceId: requiredString('Invoice'),
  amount: money('Amount'),
});

/** Record a payment made to a supplier against one of their invoices. */
export async function paySupplierInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(supplierPaymentSchema, formData);
    if (!parsed.success) return parsed.state;

    const supplierId = await prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.findUnique({
        where: { id: parsed.data.supplierInvoiceId },
        select: { id: true, supplierId: true, paidAmount: true },
      });
      if (!invoice) throw new Error('Supplier invoice not found.');

      await tx.supplierInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: toStorage(add(invoice.paidAmount, parsed.data.amount)) },
      });

      await recalcSupplierInvoiceStatus(tx, invoice.id);
      return invoice.supplierId;
    });

    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: true, message: 'Payment recorded.' };
  } catch (error) {
    return toActionState(error);
  }
}

const disputeSchema = z.object({
  supplierInvoiceId: requiredString('Invoice'),
  disputeNote: optionalString,
  action: z.enum(['dispute', 'resolve']),
});

/** Flag or clear a dispute on a supplier invoice (PRD section 3). */
export async function setSupplierInvoiceDispute(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(disputeSchema, formData);
    if (!parsed.success) return parsed.state;

    const supplierId = await prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.update({
        where: { id: parsed.data.supplierInvoiceId },
        data:
          parsed.data.action === 'dispute'
            ? { status: 'DISPUTED', disputeNote: parsed.data.disputeNote }
            : { status: 'UNPAID', disputeNote: null },
        select: { id: true, supplierId: true },
      });

      // Clearing a dispute re-derives the status from what has been paid.
      if (parsed.data.action === 'resolve') {
        await recalcSupplierInvoiceStatus(tx, invoice.id);
      }
      return invoice.supplierId;
    });

    revalidatePath(`/suppliers/${supplierId}`);
    return {
      ok: true,
      message: parsed.data.action === 'dispute' ? 'Invoice disputed.' : 'Dispute cleared.',
    };
  } catch (error) {
    return toActionState(error);
  }
}
