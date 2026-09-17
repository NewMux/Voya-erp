'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import {
  checkbox,
  optionalDateOnly,
  optionalEmail,
  optionalPhone,
  optionalString,
  percent,
  phone,
  requiredString,
} from '@/lib/validation';
import { issueMembership, renewMembership } from '@/server/services/membership.service';
import { annualExpiry, toDateOnly } from '@/lib/dates';
import { toStorage } from '@/lib/money';
import { parseForm, toActionState, type ActionState } from './types';

const customerSchema = z.object({
  fullName: requiredString('Full name'),
  phone,
  whatsappPhone: optionalPhone,
  email: optionalEmail,
  nationality: optionalString,
  customerType: z.enum(['INDIVIDUAL', 'CORPORATE']),
  passportNumber: optionalString,
  passportExpiry: optionalDateOnly,
  companyName: optionalString,
  crNumber: optionalString,
  billingContact: optionalString,
  billingEmail: optionalEmail,
  agreedRateNote: optionalString,
  notes: optionalString,
});

/** Corporate customers need a company name; individuals must not carry one. */
function normaliseCorporate(data: z.infer<typeof customerSchema>) {
  if (data.customerType === 'CORPORATE') {
    return data;
  }
  return {
    ...data,
    companyName: null,
    crNumber: null,
    billingContact: null,
    billingEmail: null,
    agreedRateNote: null,
  };
}

export async function createCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let customerId: string;

  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(customerSchema, formData);
    if (!parsed.success) return parsed.state;

    if (parsed.data.customerType === 'CORPORATE' && !parsed.data.companyName) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { companyName: 'Company name is required for corporate customers' },
      };
    }

    const customer = await prisma.customer.create({ data: normaliseCorporate(parsed.data) });
    customerId = customer.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/customers');
  redirect(`/customers/${customerId}`);
}

export async function updateCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, error: 'Missing customer id.' };

    const parsed = parseForm(customerSchema, formData);
    if (!parsed.success) return parsed.state;

    if (parsed.data.customerType === 'CORPORATE' && !parsed.data.companyName) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { companyName: 'Company name is required for corporate customers' },
      };
    }

    await prisma.customer.update({ where: { id }, data: normaliseCorporate(parsed.data) });

    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    return { ok: true, message: 'Customer updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

const membershipSchema = z.object({
  customerId: requiredString('Customer'),
  tier: z.enum(['VOYAGEUR', 'GOLD', 'PLATINUM']),
  startDate: optionalDateOnly,
  expiryDate: optionalDateOnly,
  discountPercent: percent('Discount'),
  groupBookingPriority: checkbox,
});

/** Issue a membership (PRD section 5). The number is allocated by a sequence. */
export async function issueMembershipAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(membershipSchema, formData);
    if (!parsed.success) return parsed.state;

    const { customerId, startDate, expiryDate, ...rest } = parsed.data;

    const existing = await prisma.membership.findUnique({ where: { customerId } });
    if (existing) {
      return { ok: false, error: 'This customer already has a membership.' };
    }

    const start = startDate ?? toDateOnly(new Date());

    await prisma.$transaction((tx) =>
      issueMembership(tx, {
        customerId,
        tier: rest.tier,
        startDate: start,
        expiryDate: expiryDate ?? annualExpiry(start),
        discountPercent: rest.discountPercent,
        groupBookingPriority: rest.groupBookingPriority,
      }),
    );

    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/memberships');
    return { ok: true, message: 'Membership issued.' };
  } catch (error) {
    return toActionState(error);
  }
}

const renewalSchema = z.object({
  membershipId: requiredString('Membership'),
  amount: z
    .string()
    .trim()
    .transform((v) => (v === '' ? '0' : v))
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), 'Amount must be a number'),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'BENEFIT_PAY', 'OTHER']),
  reference: optionalString,
});

/**
 * Renew a membership and record the payment.
 *
 * The PRD says renewal payments are recorded "the same way as any other
 * payment", so this writes a real Payment row rather than a special case.
 */
export async function renewMembershipAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(renewalSchema, formData);
    if (!parsed.success) return parsed.state;

    const membership = await prisma.membership.findUnique({
      where: { id: parsed.data.membershipId },
      select: { id: true, customerId: true },
    });
    if (!membership) return { ok: false, error: 'Membership not found.' };

    await prisma.$transaction(async (tx) => {
      const payment =
        Number.parseFloat(parsed.data.amount) > 0
          ? await tx.payment.create({
              data: {
                customerId: membership.customerId,
                membershipId: membership.id,
                amount: toStorage(parsed.data.amount),
                currency: 'BHD',
                method: parsed.data.method,
                reference: parsed.data.reference,
                paidAt: new Date(),
                recordedById: user.id,
                notes: 'Membership renewal',
              },
            })
          : null;

      await renewMembership(tx, {
        membershipId: membership.id,
        amount: parsed.data.amount,
        paymentId: payment?.id ?? null,
      });
    });

    revalidatePath(`/customers/${membership.customerId}`);
    revalidatePath('/memberships');
    return { ok: true, message: 'Membership renewed.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** Cancel a membership without deleting its history. */
export async function cancelMembershipAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const id = String(formData.get('membershipId') ?? '');
    if (!id) return { ok: false, error: 'Missing membership id.' };

    const membership = await prisma.membership.update({
      where: { id },
      data: { status: 'CANCELLED' },
      select: { customerId: true },
    });

    revalidatePath(`/customers/${membership.customerId}`);
    revalidatePath('/memberships');
    return { ok: true, message: 'Membership cancelled.' };
  } catch (error) {
    return toActionState(error);
  }
}
