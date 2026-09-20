'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole, requireUser } from '@/server/guards';
import { optionalDateOnly, optionalString, requiredString } from '@/lib/validation';
import { parseForm, toActionState, type ActionState } from './types';

/**
 * Companions — dependents travelling with a primary member (e.g. a child),
 * collected in full but never registered as their own customer: no phone or
 * email, no membership. Kept on the primary member's profile and reused
 * across bookings via the Companion picker on the traveler rows, rather than
 * re-typed every time.
 */

const companionSchema = z.object({
  primaryCustomerId: requiredString('Customer'),
  fullName: requiredString('Full name'),
  relationship: optionalString,
  dateOfBirth: optionalDateOnly,
  passportNumber: optionalString,
  passportExpiry: optionalDateOnly,
  nationality: optionalString,
  notes: optionalString,
});

export async function createCompanion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(companionSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.companion.create({ data: parsed.data });

    revalidatePath(`/customers/${parsed.data.primaryCustomerId}`);
    return { ok: true, message: 'Companion added.' };
  } catch (error) {
    return toActionState(error);
  }
}

const updateSchema = companionSchema.extend({ id: requiredString('Companion') });

export async function updateCompanion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(updateSchema, formData);
    if (!parsed.success) return parsed.state;

    const { id, ...data } = parsed.data;
    await prisma.companion.update({ where: { id }, data });

    revalidatePath(`/customers/${parsed.data.primaryCustomerId}`);
    return { ok: true, message: 'Companion updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteCompanion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const id = String(formData.get('id') ?? '');
    const companion = await prisma.companion.delete({ where: { id } });

    revalidatePath(`/customers/${companion.primaryCustomerId}`);
    return { ok: true, message: 'Companion removed.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** The New Booking screen's traveler rows offer these to auto-fill from. */
export async function lookupCompanions(primaryCustomerId: string) {
  await requireUser();
  if (!primaryCustomerId) return [];

  return prisma.companion.findMany({
    where: { primaryCustomerId },
    orderBy: { fullName: 'asc' },
  });
}
