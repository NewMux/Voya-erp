'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import { count, currency, money, optionalString, requiredString } from '@/lib/validation';
import { toStorage } from '@/lib/money';
import { parseForm, toActionState, type ActionState } from './types';

/**
 * Visa country reference data, managed under Settings.
 *
 * Selecting a destination country on the dedicated Visa booking flow reads
 * this table and auto-populates embassy, fee, required documents, terms and
 * processing time, so staff never retype the same country's requirements.
 */

const visaCountrySchema = z.object({
  country: requiredString('Country'),
  embassyName: optionalString,
  visaFeeAmount: money('Visa fee'),
  visaFeeCurrency: currency,
  requiredDocuments: optionalString,
  termsAndConditions: optionalString,
  processingTimeDays: count('Processing time', 0).optional(),
});

export async function createVisaCountry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const parsed = parseForm(visaCountrySchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.visaCountryReference.create({
      data: {
        country: parsed.data.country,
        embassyName: parsed.data.embassyName,
        visaFeeAmount: toStorage(parsed.data.visaFeeAmount, parsed.data.visaFeeCurrency),
        visaFeeCurrency: parsed.data.visaFeeCurrency,
        requiredDocuments: parsed.data.requiredDocuments,
        termsAndConditions: parsed.data.termsAndConditions,
        processingTimeDays: parsed.data.processingTimeDays ?? null,
      },
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/settings/visa-countries');
  redirect('/settings/visa-countries');
}

export async function updateVisaCountry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');

  try {
    await assertRole('ADMIN');

    const parsed = parseForm(visaCountrySchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.visaCountryReference.update({
      where: { id },
      data: {
        country: parsed.data.country,
        embassyName: parsed.data.embassyName,
        visaFeeAmount: toStorage(parsed.data.visaFeeAmount, parsed.data.visaFeeCurrency),
        visaFeeCurrency: parsed.data.visaFeeCurrency,
        requiredDocuments: parsed.data.requiredDocuments,
        termsAndConditions: parsed.data.termsAndConditions,
        processingTimeDays: parsed.data.processingTimeDays ?? null,
      },
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/settings/visa-countries');
  redirect('/settings/visa-countries');
}

const toggleSchema = z.object({ id: requiredString('Country') });

export async function toggleVisaCountryActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const parsed = parseForm(toggleSchema, formData);
    if (!parsed.success) return parsed.state;

    const row = await prisma.visaCountryReference.findUnique({
      where: { id: parsed.data.id },
      select: { isActive: true },
    });
    if (!row) throw new Error('Country not found.');

    await prisma.visaCountryReference.update({
      where: { id: parsed.data.id },
      data: { isActive: !row.isActive },
    });

    revalidatePath('/settings/visa-countries');
    return { ok: true, message: row.isActive ? 'Deactivated.' : 'Reactivated.' };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Looked up by the dedicated Visa booking flow when staff pick a
 * destination country — callable directly from a client component.
 */
export async function lookupVisaCountry(country: string) {
  await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');
  if (!country.trim()) return null;

  return prisma.visaCountryReference.findFirst({
    where: { country: { equals: country.trim(), mode: 'insensitive' }, isActive: true },
  });
}
