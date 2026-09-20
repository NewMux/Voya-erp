'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import { dateOnly, optionalString, requiredString } from '@/lib/validation';
import { storage } from '@/server/storage';
import { parseForm, toActionState, type ActionState } from './types';

/**
 * External partners offering discounts/benefits to Voya members, managed
 * under Settings. Separate from Membership.discountPercent, which is Voya's
 * own booking discount — these never touch that.
 */

const partnerOfferSchema = z.object({
  name: requiredString('Partner name'),
  country: optionalString,
  description: requiredString('Description', 2000),
  termsAndConditions: optionalString,
  agreementStart: dateOnly,
  agreementEnd: dateOnly,
});

async function uploadIfProvided(
  formData: FormData,
  field: string,
  prefix: string,
): Promise<string | undefined> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return undefined;
  const stored = await storage().save(file, prefix);
  return stored.fileKey;
}

export async function createPartnerOffer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const parsed = parseForm(partnerOfferSchema, formData);
    if (!parsed.success) return parsed.state;

    if (parsed.data.agreementEnd.getTime() < parsed.data.agreementStart.getTime()) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { agreementEnd: 'Agreement end cannot be before the start date' },
      };
    }

    const [logoFileKey, agreementDocumentFileKey] = await Promise.all([
      uploadIfProvided(formData, 'logo', 'partner-offers'),
      uploadIfProvided(formData, 'agreementDocument', 'partner-offers'),
    ]);

    await prisma.partnerOffer.create({
      data: { ...parsed.data, logoFileKey, agreementDocumentFileKey },
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/settings/partner-offers');
  redirect('/settings/partner-offers');
}

const updateSchema = partnerOfferSchema.extend({ id: requiredString('Partner offer') });

export async function updatePartnerOffer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const parsed = parseForm(updateSchema, formData);
    if (!parsed.success) return parsed.state;

    if (parsed.data.agreementEnd.getTime() < parsed.data.agreementStart.getTime()) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: { agreementEnd: 'Agreement end cannot be before the start date' },
      };
    }

    const { id, ...data } = parsed.data;

    const [logoFileKey, agreementDocumentFileKey] = await Promise.all([
      uploadIfProvided(formData, 'logo', 'partner-offers'),
      uploadIfProvided(formData, 'agreementDocument', 'partner-offers'),
    ]);

    await prisma.partnerOffer.update({
      where: { id },
      data: {
        ...data,
        ...(logoFileKey ? { logoFileKey } : {}),
        ...(agreementDocumentFileKey ? { agreementDocumentFileKey } : {}),
      },
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/settings/partner-offers');
  redirect('/settings/partner-offers');
}

const toggleSchema = z.object({ id: requiredString('Partner offer') });

export async function togglePartnerOfferActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const parsed = parseForm(toggleSchema, formData);
    if (!parsed.success) return parsed.state;

    const row = await prisma.partnerOffer.findUnique({
      where: { id: parsed.data.id },
      select: { isActive: true },
    });
    if (!row) throw new Error('Partner offer not found.');

    await prisma.partnerOffer.update({
      where: { id: parsed.data.id },
      data: { isActive: !row.isActive },
    });

    revalidatePath('/settings/partner-offers');
    return { ok: true, message: row.isActive ? 'Deactivated.' : 'Reactivated.' };
  } catch (error) {
    return toActionState(error);
  }
}
