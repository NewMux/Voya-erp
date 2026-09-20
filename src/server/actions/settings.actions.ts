'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import { checkbox, optionalString, percent, requiredString } from '@/lib/validation';
import { parseForm, toActionState, type ActionState } from './types';

/**
 * Company and invoice settings.
 *
 * Backs the values `src/app/api/invoices/[id]/pdf/route.ts` reads for the
 * branded PDF header/footer, and the default discount the membership form
 * pre-fills. Every row is an `AppSetting` key/value pair rather than typed
 * columns, so a new setting is a row, not a migration.
 */

const settingsSchema = z.object({
  'company.name': requiredString('Company name'),
  'company.nameAr': optionalString,
  'company.address': optionalString,
  'company.addressAr': optionalString,
  'company.phone': optionalString,
  'company.email': optionalString,
  'company.instagram': optionalString,
  'invoice.terms': optionalString,
  'invoice.termsAr': optionalString,
  'membership.defaultDiscountPercent': percent('Default discount'),
  'membership.familyDiscountEnabled': checkbox.transform((v) => (v ? 'true' : 'false')),
  'membership.familyDiscountPercent': percent('Family discount'),
});

export async function updateSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN');

    const parsed = parseForm(settingsSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.$transaction(
      Object.entries(parsed.data).map(([key, value]) =>
        prisma.appSetting.upsert({
          where: { key },
          update: { value: value ?? '' },
          create: { key, value: value ?? '' },
        }),
      ),
    );

    // Every page that reads AppSetting (here, the invoice PDF route, the
    // membership form) is already `force-dynamic`, so nothing else needs
    // revalidating — there is no cached render of this data to invalidate.
    revalidatePath('/settings');
    return { ok: true, message: 'Settings saved.' };
  } catch (error) {
    return toActionState(error);
  }
}
