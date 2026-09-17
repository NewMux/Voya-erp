'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import { requiredString } from '@/lib/validation';
import { dispatchPending } from '@/server/services/dispatch.service';
import { parseForm, toActionState, type ActionState } from './types';

const idSchema = z.object({ notificationId: requiredString('Notification') });

/**
 * Mark a queued message as sent by hand.
 *
 * This is the other half of the wa.me fallback: staff open the link, send the
 * message in WhatsApp, then record that here so it stops appearing in the
 * queue and the audit trail shows who sent it.
 */
export async function markNotificationSent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(idSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.notificationOutbox.update({
      where: { id: parsed.data.notificationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentManually: true,
        sentById: user.id,
        provider: 'manual',
        lastError: null,
      },
    });

    revalidatePath('/notifications');
    return { ok: true, message: 'Marked as sent.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** Cancel a queued message that should not go out. */
export async function cancelNotification(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(idSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.notificationOutbox.update({
      where: { id: parsed.data.notificationId },
      data: { status: 'CANCELLED' },
    });

    revalidatePath('/notifications');
    return { ok: true, message: 'Cancelled.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** Put a failed message back in the queue. */
export async function retryNotification(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(idSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.notificationOutbox.update({
      where: { id: parsed.data.notificationId },
      data: {
        status: 'PENDING',
        // Reset the attempt count, or a previously exhausted message would be
        // rejected again by the dispatcher on sight.
        attempts: 0,
        scheduledFor: new Date(),
        lastError: null,
      },
    });

    revalidatePath('/notifications');
    return { ok: true, message: 'Queued for another attempt.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** Run the dispatcher now, without waiting for the scheduled task. */
export async function dispatchNow(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const result = await dispatchPending({ limit: 25 });

    revalidatePath('/notifications');
    return {
      ok: true,
      message:
        result.sent > 0
          ? `Sent ${result.sent}.`
          : result.manual > 0
            ? `${result.manual} ready to send manually.`
            : 'Nothing to dispatch.',
    };
  } catch (error) {
    return toActionState(error);
  }
}
