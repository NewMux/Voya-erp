import Link from 'next/link';
import { requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { waMeLink } from '@/server/services/notification.service';
import { formatDateTime } from '@/lib/dates';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { humanise, NotificationStatusBadge } from '@/components/status';
import { DispatchNowButton, ManualSendActions, RetryAction } from './panels';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/**
 * WhatsApp outbox — PRD section 6.
 *
 * In manual mode this is the send queue: staff open each message in WhatsApp
 * and mark it sent. In Meta mode it is a monitoring view, with delivery
 * receipts flowing in from the webhook.
 */
export default async function NotificationsPage() {
  await requireUser();
  const config = env();
  const manualMode = config.WHATSAPP_PROVIDER === 'manual';

  const [pending, recent, counts] = await Promise.all([
    prisma.notificationOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { scheduledFor: 'asc' },
      take: 100,
      include: {
        customer: { select: { id: true, fullName: true } },
        booking: { select: { id: true, reference: true } },
      },
    }),
    prisma.notificationOutbox.findMany({
      where: { status: { in: ['SENT', 'FAILED', 'CANCELLED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      include: {
        customer: { select: { id: true, fullName: true } },
        sentBy: { select: { name: true } },
      },
    }),
    prisma.notificationOutbox.groupBy({ by: ['status'], _count: true }),
  ]);

  const countFor = (status: string) =>
    counts.find((row) => row.status === status)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Booking confirmations, balance reminders, membership renewals and staff capacity alerts."
        actions={<DispatchNowButton />}
      />

      <div className="mb-6">
        <Alert tone={manualMode ? 'warning' : 'info'}>
          {manualMode ? (
            <>
              <strong>Manual mode.</strong> Messages queue here for staff to send via WhatsApp.
              Set <code className="font-mono text-xs">WHATSAPP_PROVIDER=meta</code> with Cloud API
              credentials to send them automatically.
            </>
          ) : (
            <>
              <strong>Cloud API mode.</strong> Queued messages are sent automatically by the
              scheduled task, and delivery receipts arrive via the webhook.
            </>
          )}
        </Alert>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Queued" value={String(countFor('PENDING'))} />
        <Stat label="Sent" value={String(countFor('SENT'))} />
        <Stat
          label="Failed"
          value={String(countFor('FAILED'))}
          tone={countFor('FAILED') > 0 ? 'danger' : 'neutral'}
        />
        <Stat label="Cancelled" value={String(countFor('CANCELLED'))} />
      </div>

      <div className="space-y-6">
        <Card
          title="Queue"
          description={
            manualMode
              ? 'Open each in WhatsApp, send it, then mark it sent.'
              : 'Awaiting the next dispatch run.'
          }
        >
          {pending.length === 0 ? (
            <EmptyState
              title="Nothing queued"
              description="Confirmations and reminders will appear here as they come due."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((row) => (
                <li key={row.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={row.recipientType === 'STAFF' ? 'info' : 'neutral'}>
                          {humanise(row.event)}
                        </Badge>
                        {row.recipientType === 'STAFF' ? (
                          <Badge tone="warning">Staff alert</Badge>
                        ) : null}
                        <span className="text-xs text-slate-500 tabular-nums">
                          +{row.toPhone}
                        </span>
                        {row.customer ? (
                          <Link
                            href={`/customers/${row.customer.id}`}
                            className="text-xs text-voya-700 hover:underline"
                          >
                            {row.customer.fullName}
                          </Link>
                        ) : null}
                        {row.booking ? (
                          <Link
                            href={`/bookings/${row.booking.id}`}
                            className="text-xs text-voya-700 hover:underline"
                          >
                            {row.booking.reference}
                          </Link>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">
                        {row.renderedBodyEn}
                      </p>

                      {row.attempts > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">
                          {row.attempts} attempt{row.attempts === 1 ? '' : 's'}
                          {row.lastError ? ` · ${row.lastError}` : ''}
                        </p>
                      ) : null}
                    </div>

                    <ManualSendActions
                      notificationId={row.id}
                      waLink={waMeLink(row.toPhone, row.renderedBodyEn)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent">
          {recent.length === 0 ? (
            <EmptyState title="Nothing sent yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>To</Th>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th>Delivery</Th>
                  <Th>When</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <Td>{humanise(row.event)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">+{row.toPhone}</Td>
                    <Td className="max-w-[10rem] truncate">
                      {row.customer ? (
                        <Link
                          href={`/customers/${row.customer.id}`}
                          className="hover:underline"
                        >
                          {row.customer.fullName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Staff</span>
                      )}
                    </Td>
                    <Td>
                      <NotificationStatusBadge status={row.status} />
                      {row.sentManually ? (
                        <p className="text-xs text-slate-500">
                          by {row.sentBy?.name ?? 'staff'}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-slate-600">
                      {row.deliveryStatus === 'UNKNOWN' ? '—' : humanise(row.deliveryStatus)}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {formatDateTime(row.sentAt ?? row.updatedAt)}
                    </Td>
                    <Td>
                      {row.status === 'FAILED' ? <RetryAction notificationId={row.id} /> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
