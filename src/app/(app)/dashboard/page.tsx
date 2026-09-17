import Link from 'next/link';
import { BookingStatus, InvoiceStatus, ScheduleItemStatus } from '@prisma/client';
import { requireUser } from '@/server/guards';
import { canSeeFinancials } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { addDays, formatDate, today } from '@/lib/dates';
import { add, formatMoney, subtract, toStorage } from '@/lib/money';
import { Alert, Badge, Card, EmptyState, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/status';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * Operational dashboard.
 *
 * Deliberately a small set of "what needs attention today" counters — the
 * advanced dashboard and reporting suite is Phase 2.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const showMoney = canSeeFinancials(user.role);

  const now = new Date();
  const from = today(now);
  const horizon = addDays(from, 30);

  const [
    upcomingDepartures,
    outstandingItems,
    overdueInvoices,
    pendingNotifications,
    fillingTrips,
    recentBookings,
  ] = await Promise.all([
    prisma.booking.count({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.TICKETED] },
        departureDate: { gte: from, lte: horizon },
      },
    }),
    prisma.paymentScheduleItem.findMany({
      where: {
        status: { in: [ScheduleItemStatus.PENDING, ScheduleItemStatus.PARTIALLY_PAID] },
        booking: { status: { notIn: [BookingStatus.CANCELLED] } },
      },
      select: { amountDue: true, paidAmount: true, dueDate: true },
    }),
    prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
    prisma.notificationOutbox.count({ where: { status: 'PENDING' } }),
    prisma.groupDeparture.findMany({
      where: { status: { in: ['OPEN', 'FULL'] }, departureDate: { gte: from } },
      orderBy: { departureDate: 'asc' },
      take: 5,
      select: {
        id: true,
        name: true,
        departureDate: true,
        capacity: true,
        seatsBooked: true,
        status: true,
      },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        paymentStatus: true,
        departureDate: true,
        netSellingAmount: true,
        customer: { select: { fullName: true } },
      },
    }),
  ]);

  const outstandingTotal = outstandingItems.reduce(
    (total, item) => add(total, subtract(item.amountDue, item.paidAmount)),
    add(0),
  );
  const overdueCount = outstandingItems.filter(
    (item) => item.dueDate.getTime() < from.getTime(),
  ).length;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        description="What needs attention today."
      />

      {params.denied ? (
        <div className="mb-6">
          <Alert tone="warning">That area is restricted to other roles.</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Departures (30 days)"
          value={String(upcomingDepartures)}
          hint="Confirmed or ticketed"
        />
        {showMoney ? (
          <Stat
            label="Outstanding balances"
            value={formatMoney(toStorage(outstandingTotal))}
            hint={`${outstandingItems.length} instalment${outstandingItems.length === 1 ? '' : 's'}`}
            tone={overdueCount > 0 ? 'danger' : 'neutral'}
          />
        ) : (
          <Stat
            label="Instalments due"
            value={String(outstandingItems.length)}
            hint={overdueCount > 0 ? `${overdueCount} past due` : 'None past due'}
            tone={overdueCount > 0 ? 'danger' : 'neutral'}
          />
        )}
        <Stat
          label="Overdue invoices"
          value={String(overdueInvoices)}
          tone={overdueInvoices > 0 ? 'danger' : 'neutral'}
        />
        <Stat
          label="Queued messages"
          value={String(pendingNotifications)}
          hint="Awaiting dispatch"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Group Adventures filling up" description="Live seat counts.">
          {fillingTrips.length === 0 ? (
            <EmptyState title="No open departures" description="Create one to start taking seats." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {fillingTrips.map((trip) => {
                const remaining = Math.max(0, trip.capacity - trip.seatsBooked);
                const percent =
                  trip.capacity > 0 ? Math.round((trip.seatsBooked / trip.capacity) * 100) : 0;

                return (
                  <li key={trip.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/group-trips/departures/${trip.id}`}
                        className="block truncate text-sm font-medium text-voya-800 hover:underline"
                      >
                        {trip.name}
                      </Link>
                      <p className="text-xs text-slate-500">{formatDate(trip.departureDate)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-slate-500">
                        {trip.seatsBooked}/{trip.capacity}
                      </span>
                      <Badge tone={remaining === 0 ? 'warning' : percent >= 80 ? 'warning' : 'success'}>
                        {remaining === 0 ? 'Full' : `${remaining} left`}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent bookings">
          {recentBookings.length === 0 ? (
            <EmptyState title="No bookings yet" description="New bookings will appear here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Customer</Th>
                  <Th>Travel</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => (
                  <tr key={booking.id}>
                    <Td>
                      <Link
                        href={`/bookings/${booking.id}`}
                        className="font-medium text-voya-800 hover:underline"
                      >
                        {booking.reference}
                      </Link>
                    </Td>
                    <Td className="max-w-[12rem] truncate">{booking.customer.fullName}</Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {formatDate(booking.departureDate)}
                    </Td>
                    <Td>
                      <BookingStatusBadge status={booking.status} />
                    </Td>
                    <Td>
                      <PaymentStatusBadge status={booking.paymentStatus} />
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
