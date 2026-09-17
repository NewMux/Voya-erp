import { NotificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { whatsappProvider, type WhatsAppProvider } from '@/server/providers/whatsapp';
import {
  enqueueBalanceReminder,
  enqueueMembershipRenewalReminder,
} from './notification.service';
import {
  expireLapsedMemberships,
  membershipsDueForRenewal,
} from './membership.service';
import { scheduleItemsDueForReminder } from './booking.service';
import { markOverdueInvoices } from './invoice.service';

/**
 * The scheduled job behind /api/cron/notifications.
 *
 * Two phases, deliberately separate:
 *
 *   1. Enqueue — work out what is due and write outbox rows. Idempotent via
 *      each row's dedupe key, so running it twice in a day sends nothing twice.
 *   2. Dispatch — hand pending rows to the provider.
 *
 * Keeping them apart means a WhatsApp outage does not stop reminders being
 * *scheduled*; they simply queue until the provider recovers.
 */

/** How many attempts before a message is left alone for a human to look at. */
const MAX_ATTEMPTS = 5;

export type CronResult = {
  membershipsExpired: number;
  invoicesMarkedOverdue: number;
  balanceRemindersQueued: number;
  renewalRemindersQueued: number;
  dispatched: { sent: number; manual: number; failed: number; skipped: number };
};

/** Phase 1: sweep statuses and queue everything that has come due. */
export async function enqueueDueNotifications(now: Date = new Date()) {
  const config = env();

  const [membershipsExpired, invoicesMarkedOverdue] = await Promise.all([
    expireLapsedMemberships(prisma, now),
    markOverdueInvoices(prisma, now),
  ]);

  let balanceRemindersQueued = 0;
  const dueItems = await scheduleItemsDueForReminder(
    prisma,
    config.REMINDER_BALANCE_DAYS_BEFORE,
    now,
  );
  for (const item of dueItems) {
    if (await enqueueBalanceReminder(prisma, item.id)) balanceRemindersQueued += 1;
  }

  let renewalRemindersQueued = 0;
  // Expiry is swept first, so a membership that lapsed today is not also
  // chased for renewal in the same run.
  const dueMemberships = await membershipsDueForRenewal(
    prisma,
    config.REMINDER_MEMBERSHIP_DAYS_BEFORE,
    now,
  );
  for (const membership of dueMemberships) {
    if (await enqueueMembershipRenewalReminder(prisma, membership.id)) {
      renewalRemindersQueued += 1;
    }
  }

  return {
    membershipsExpired,
    invoicesMarkedOverdue,
    balanceRemindersQueued,
    renewalRemindersQueued,
  };
}

/**
 * Phase 2: hand pending messages to the provider.
 *
 * Each row is claimed with a conditional update before sending, so two
 * overlapping cron runs cannot both dispatch the same message.
 */
export async function dispatchPending(
  options: { limit?: number; now?: Date; provider?: WhatsAppProvider } = {},
) {
  const limit = options.limit ?? 50;
  const now = options.now ?? new Date();
  const provider = options.provider ?? whatsappProvider();

  const pending = await prisma.notificationOutbox.findMany({
    where: {
      status: NotificationStatus.PENDING,
      scheduledFor: { lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
    include: { template: true },
  });

  const result = { sent: 0, manual: 0, failed: 0, skipped: 0 };

  for (const row of pending) {
    // Claim it: the updateMany only matches while the row is still PENDING, so
    // a concurrent run that got there first leaves nothing to claim.
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: NotificationStatus.PENDING },
      data: { status: NotificationStatus.SENDING, attempts: { increment: 1 } },
    });

    if (claimed.count === 0) {
      result.skipped += 1;
      continue;
    }

    const variables = (row.variables ?? {}) as Record<string, string>;
    const outcome = await provider.send({
      toPhone: row.toPhone,
      body: row.renderedBodyEn,
      metaTemplateName: row.template.metaTemplateName,
      metaLanguageCode: row.template.metaLanguageCode,
      // Meta positions parameters by order, so the template's declared
      // variable order is what decides {{1}}, {{2}}, …
      templateParameters: row.template.variables.map((key) => variables[key] ?? ''),
    });

    if (outcome.status === 'SENT') {
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          provider: outcome.provider,
          providerMessageId: outcome.providerMessageId,
          deliveryStatus: 'ACCEPTED',
          lastError: null,
        },
      });
      result.sent += 1;
    } else if (outcome.status === 'MANUAL') {
      // Put it back to PENDING: staff will send it from the Notifications
      // screen, and it must stay visible there until they do.
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          status: NotificationStatus.PENDING,
          provider: outcome.provider,
          lastError: null,
        },
      });
      result.manual += 1;
    } else {
      const attempts = row.attempts + 1;
      const exhausted = !outcome.retryable || attempts >= MAX_ATTEMPTS;

      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING,
          provider: outcome.provider,
          lastError: outcome.error,
          // Back off exponentially so a flapping API is not hammered.
          scheduledFor: exhausted
            ? row.scheduledFor
            : new Date(now.getTime() + Math.min(2 ** attempts, 60) * 60_000),
        },
      });
      result.failed += 1;
    }
  }

  return result;
}

/** Everything the cron route runs, in order. */
export async function runNotificationCron(now: Date = new Date()): Promise<CronResult> {
  const queued = await enqueueDueNotifications(now);
  const dispatched = await dispatchPending({ now });
  return { ...queued, dispatched };
}
