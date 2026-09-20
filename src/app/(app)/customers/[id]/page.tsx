import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canSeeFinancials, requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { bookingDestination, customerBookingHistory } from '@/server/services/customer.service';
import { customerLifetimeValue } from '@/server/services/membership.service';
import { bookingBalance } from '@/server/services/booking.service';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { normalisePhone, waMeLink } from '@/server/services/notification.service';
import {
  Badge,
  Card,
  DescriptionList,
  EmptyState,
  LinkButton,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { BookingStatusBadge, humanise, PaymentStatusBadge } from '@/components/status';
import { MembershipPanel } from './membership-panel';
import { DocumentsPanel } from './documents-panel';
import { CompanionsPanel } from './companions-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { fullName: true },
  });
  return { title: customer?.fullName ?? 'Customer' };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const showMoney = canSeeFinancials(user.role);

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      membership: { include: { renewals: { orderBy: { periodEnd: 'desc' } } } },
      attachments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!customer) notFound();

  const [bookings, lifetime, discountSetting, companions] = await Promise.all([
    customerBookingHistory(customer.id),
    // Lifetime value is admin/accounting only, per the PRD — don't even query
    // it for reservations staff.
    showMoney ? customerLifetimeValue(customer.id) : Promise.resolve(null),
    prisma.appSetting.findUnique({ where: { key: 'membership.defaultDiscountPercent' } }),
    prisma.companion.findMany({ where: { primaryCustomerId: id }, orderBy: { fullName: 'asc' } }),
  ]);

  const whatsapp = normalisePhone(customer.whatsappPhone ?? customer.phone);

  const travelHistory = bookings
    .filter((booking) => booking.status !== 'CANCELLED')
    .map((booking) => ({
      id: booking.id,
      type: booking.type,
      departureDate: booking.departureDate,
      destination: bookingDestination(booking) ?? humanise(booking.type),
    }));

  return (
    <>
      <PageHeader
        title={customer.fullName}
        description={
          customer.customerType === 'CORPORATE'
            ? (customer.companyName ?? 'Corporate customer')
            : 'Individual customer'
        }
        actions={
          <>
            {whatsapp ? (
              <a
                href={waMeLink(whatsapp, '')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-voya-800 hover:bg-slate-50"
              >
                WhatsApp
              </a>
            ) : null}
            <LinkButton href={`/bookings/new?customerId=${customer.id}`}>New booking</LinkButton>
            <LinkButton href={`/customers/${customer.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
          </>
        }
      />

      {showMoney && lifetime ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Lifetime value" value={formatMoney(lifetime.totalSpend)} />
          <Stat label="Lifetime margin" value={formatMoney(lifetime.totalMargin)} />
          <Stat label="Bookings" value={String(lifetime.bookingCount)} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: 'Phone', value: customer.phone },
                { label: 'WhatsApp', value: customer.whatsappPhone ?? customer.phone },
                { label: 'Email', value: customer.email ?? '—' },
                { label: 'Nationality', value: customer.nationality ?? '—' },
                { label: 'Passport number', value: customer.passportNumber ?? '—' },
                {
                  label: 'Passport expiry',
                  value: formatDate(customer.passportExpiry),
                },
                ...(customer.customerType === 'CORPORATE'
                  ? [
                      { label: 'CR number', value: customer.crNumber ?? '—' },
                      { label: 'Billing contact', value: customer.billingContact ?? '—' },
                      { label: 'Billing email', value: customer.billingEmail ?? '—' },
                      { label: 'Agreed rate', value: customer.agreedRateNote ?? '—' },
                    ]
                  : []),
              ]}
            />
            {customer.notes ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Notes</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{customer.notes}</p>
              </div>
            ) : null}
          </Card>

          <Card title="Booking history" description="Past and upcoming.">
            {bookings.length === 0 ? (
              <EmptyState
                title="No bookings yet"
                action={
                  <LinkButton href={`/bookings/new?customerId=${customer.id}`}>
                    New booking
                  </LinkButton>
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Type</Th>
                    <Th>Travel</Th>
                    <Th>Status</Th>
                    <Th>Payment</Th>
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
                      </Td>
                      <Td>{humanise(booking.type)}</Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(booking.departureDate)}
                      </Td>
                      <Td>
                        <BookingStatusBadge status={booking.status} />
                      </Td>
                      <Td>
                        <PaymentStatusBadge status={booking.paymentStatus} />
                      </Td>
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

          <Card
            title="Travel history"
            description="Destinations and services, auto-populated from bookings."
          >
            {travelHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No completed travel on file yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {travelHistory.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800">{row.destination}</span>
                      <span className="ml-2 text-slate-500">{humanise(row.type)}</span>
                    </div>
                    <span className="whitespace-nowrap text-slate-500">
                      {formatDate(row.departureDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {canSeeFinancials(user.role) ? (
            <MembershipPanel
              customerId={customer.id}
              membership={customer.membership}
              defaultDiscountPercent={discountSetting?.value ?? '10'}
              canCancel={user.role === 'ADMIN'}
            />
          ) : customer.membership ? (
            <Card title="Membership">
              <p className="font-mono text-sm tabular-nums">
                {customer.membership.membershipNumber}
              </p>
              <p className="mt-2">
                <Badge tone="gold">
                  {customer.membership.tier} · {customer.membership.discountPercent.toString()}%
                </Badge>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Expires {formatDate(customer.membership.expiryDate)}
              </p>
            </Card>
          ) : (
            <Card title="Membership">
              <p className="text-sm text-slate-500">No membership on file.</p>
            </Card>
          )}

          <DocumentsPanel customerId={customer.id} attachments={customer.attachments} />

          <CompanionsPanel customerId={customer.id} companions={companions} />
        </div>
      </div>
    </>
  );
}
