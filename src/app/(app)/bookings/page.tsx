import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { canSeeFinancials, requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { bookingBalance } from '@/server/services/booking.service';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { BookingStatusBadge, humanise, PaymentStatusBadge } from '@/components/status';

export const metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

const STATUSES = ['INQUIRY', 'CONFIRMED', 'TICKETED', 'COMPLETED', 'CANCELLED'] as const;
const TYPES = ['FLIGHT', 'HOTEL', 'PACKAGE', 'VISA', 'TRANSPORT', 'GROUP_ADVENTURE'] as const;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; payment?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const showMoney = canSeeFinancials(user.role);

  const where: Prisma.BookingWhereInput = {};

  if (query.q?.trim()) {
    const term = query.q.trim();
    where.OR = [
      { reference: { contains: term, mode: 'insensitive' } },
      { customer: { fullName: { contains: term, mode: 'insensitive' } } },
      { customer: { membership: { membershipNumber: { contains: term, mode: 'insensitive' } } } },
      { flightDetail: { pnr: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (query.status && STATUSES.includes(query.status as never)) {
    where.status = query.status as (typeof STATUSES)[number];
  }
  if (query.type && TYPES.includes(query.type as never)) {
    where.type = query.type as (typeof TYPES)[number];
  }
  if (query.payment && ['UNPAID', 'DEPOSIT_PAID', 'FULLY_PAID'].includes(query.payment)) {
    where.paymentStatus = query.payment as 'UNPAID' | 'DEPOSIT_PAID' | 'FULLY_PAID';
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      customer: { select: { id: true, fullName: true } },
      supplier: { select: { name: true } },
      scheduleItems: { select: { amountDue: true, paidAmount: true, status: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Flights, hotels, packages, visas, transport and group adventures."
        actions={<LinkButton href="/bookings/new">New booking</LinkButton>}
      />

      <Card>
        <form method="get" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={query.q ?? ''}
              placeholder="Reference, customer, PNR…"
              className="pl-9"
              aria-label="Search bookings"
            />
          </div>

          <Select name="type" defaultValue={query.type ?? ''} aria-label="Filter by type">
            <option value="">All types</option>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {humanise(type)}
              </option>
            ))}
          </Select>

          <Select name="status" defaultValue={query.status ?? ''} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {humanise(status)}
              </option>
            ))}
          </Select>

          <Select
            name="payment"
            defaultValue={query.payment ?? ''}
            aria-label="Filter by payment status"
          >
            <option value="">Any payment status</option>
            <option value="UNPAID">Unpaid</option>
            <option value="DEPOSIT_PAID">Deposit paid</option>
            <option value="FULLY_PAID">Fully paid</option>
          </Select>

          <div className="flex gap-2 sm:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-voya-400 px-3.5 py-2 text-sm font-medium text-white hover:bg-voya-500"
            >
              Apply filters
            </button>
            <LinkButton href="/bookings" variant="ghost">
              Reset
            </LinkButton>
          </div>
        </form>

        {bookings.length === 0 ? (
          <EmptyState
            title="No bookings found"
            description="Adjust the filters, or create the first booking."
            action={<LinkButton href="/bookings/new">New booking</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Customer</Th>
                <Th>Type</Th>
                <Th>Travel</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                {showMoney ? <Th className="text-right">Total</Th> : null}
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/bookings/${booking.id}`}
                      className="font-medium text-voya-800 hover:underline"
                    >
                      {booking.reference}
                    </Link>
                    {booking.supplier ? (
                      <p className="text-xs text-slate-500">{booking.supplier.name}</p>
                    ) : null}
                  </Td>
                  <Td className="max-w-[12rem] truncate">
                    <Link
                      href={`/customers/${booking.customer.id}`}
                      className="hover:underline"
                    >
                      {booking.customer.fullName}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{humanise(booking.type)}</Td>
                  <Td className="whitespace-nowrap text-slate-600">
                    {formatDate(booking.departureDate)}
                  </Td>
                  <Td>
                    <BookingStatusBadge status={booking.status} />
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={booking.paymentStatus} />
                  </Td>
                  {showMoney ? (
                    <Td className="text-right tabular-nums">
                      {formatMoney(booking.netSellingAmount.toString(), 'BHD', {
                        withCode: false,
                      })}
                    </Td>
                  ) : null}
                  <Td className="text-right tabular-nums">
                    {booking.status === 'CANCELLED'
                      ? '—'
                      : formatMoney(bookingBalance(booking), 'BHD', { withCode: false })}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
