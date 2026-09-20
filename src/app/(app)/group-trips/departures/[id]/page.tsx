import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { canSeeFinancials, requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { departureRoster, departureWithCounts, waitlistInOrder } from '@/server/services/group.service';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  Alert,
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
import { BookingStatusBadge, DepartureStatusBadge, humanise } from '@/components/status';
import { DepartureControls, WaitlistEntryActions, WaitlistForm } from '../../forms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const departure = await prisma.groupDeparture.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: departure?.name ?? 'Departure' };
}

export default async function DeparturePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const showCost = canSeeFinancials(user.role);
  const { id } = await params;

  const departure = await departureWithCounts(id);
  if (!departure) notFound();

  const [waitlist, roster, customers] = await Promise.all([
    waitlistInOrder(id),
    departureRoster(id),
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      take: 500,
      select: { id: true, fullName: true, membership: { select: { membershipNumber: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={departure.name}
        description={`${departure.destination ?? 'Group Adventure'} · departs ${formatDate(
          departure.departureDate,
        )}`}
        actions={
          <>
            <DepartureStatusBadge status={departure.status} />
            <a
              href={`/group-trips/departures/${departure.id}/roster.csv`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-voya-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export roster
            </a>
            <LinkButton href={`/bookings/new?departureId=${departure.id}`}>
              Book seats
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Seats booked"
          value={`${departure.seatsBooked} / ${departure.capacity}`}
          hint={`${departure.percentFull}% full`}
          tone={departure.seatsRemaining === 0 ? 'danger' : 'neutral'}
        />
        <Stat label="Seats remaining" value={String(departure.seatsRemaining)} />
        <Stat label="Price per seat" value={formatMoney(departure.pricePerSeat.toString())} />
        {showCost ? (
          <Stat label="Cost per seat" value={formatMoney(departure.costPerSeat.toString())} />
        ) : null}
        <Stat
          label="Waitlist"
          value={String(waitlist.length)}
          hint={departure.waitlistEnabled ? 'Open' : 'Not needed yet'}
        />
      </div>

      {departure.seatsRemaining === 0 && departure.status !== 'CANCELLED' ? (
        <div className="mb-6">
          <Alert tone="warning" title="This departure is full">
            New requests go to the waitlist. Members with booking priority are offered seats
            first.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Bookings on this departure">
            {departure.activeBookings.length === 0 ? (
              <EmptyState
                title="No seats booked yet"
                action={
                  <LinkButton href={`/bookings/new?departureId=${departure.id}`}>
                    Book seats
                  </LinkButton>
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Customer</Th>
                    <Th className="text-right">Seats</Th>
                    <Th className="text-right">Single supp.</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {departure.activeBookings.map((row) => (
                    <tr key={row.bookingId} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/bookings/${row.bookingId}`}
                          className="font-medium text-voya-800 hover:underline"
                        >
                          {row.booking.reference}
                        </Link>
                      </Td>
                      <Td className="max-w-[12rem] truncate">
                        <Link
                          href={`/customers/${row.booking.customer.id}`}
                          className="hover:underline"
                        >
                          {row.booking.customer.fullName}
                        </Link>
                      </Td>
                      <Td className="text-right tabular-nums">{row.seats}</Td>
                      <Td className="text-right tabular-nums">{row.singleSupplementSeats}</Td>
                      <Td>
                        <BookingStatusBadge status={row.booking.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card
            title="Roster"
            description="Every traveller on this departure, for the tour leader."
          >
            {roster.length === 0 ? (
              <p className="text-sm text-slate-500">No travellers yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Traveller</Th>
                    <Th>Booking</Th>
                    <Th>Type</Th>
                    <Th>Passport</Th>
                    <Th>Expiry</Th>
                    <Th>Single</Th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row, index) => (
                    <tr key={`${row.bookingReference}-${index}`}>
                      <Td className="font-medium">{row.fullName}</Td>
                      <Td className="text-slate-600">{row.bookingReference}</Td>
                      <Td>{humanise(row.type)}</Td>
                      <Td className="text-slate-600">{row.passportNumber ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(row.passportExpiry)}
                      </Td>
                      <Td>{row.singleSupplement ? 'Yes' : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card
            title="Waitlist"
            description="Members with booking priority are listed first."
          >
            {waitlist.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">Nobody is waiting for a seat.</p>
            ) : (
              <div className="mb-4">
                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Customer</Th>
                      <Th className="text-right">Seats</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.map((entry, index) => (
                      <tr key={entry.id}>
                        <Td className="tabular-nums">{index + 1}</Td>
                        <Td>
                          <Link
                            href={`/customers/${entry.customer.id}`}
                            className="font-medium text-voya-800 hover:underline"
                          >
                            {entry.customer.fullName}
                          </Link>
                          {entry.priority ? (
                            <Badge className="ml-2" tone="gold">
                              Priority
                            </Badge>
                          ) : null}
                          <p className="text-xs text-slate-500">{entry.customer.phone}</p>
                        </Td>
                        <Td className="text-right tabular-nums">{entry.requestedSeats}</Td>
                        <Td>
                          <Badge tone={entry.status === 'OFFERED' ? 'info' : 'neutral'}>
                            {humanise(entry.status)}
                          </Badge>
                        </Td>
                        <Td>
                          <WaitlistEntryActions entryId={entry.id} status={entry.status} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            <div className="border-t border-slate-100 pt-4">
              <WaitlistForm
                departureId={departure.id}
                customers={customers.map((customer) => ({
                  id: customer.id,
                  fullName: customer.fullName,
                  membershipNumber: customer.membership?.membershipNumber ?? null,
                }))}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: 'Departs', value: formatDate(departure.departureDate) },
                { label: 'Returns', value: formatDate(departure.returnDate) },
                {
                  label: 'Single supplement',
                  value: formatMoney(departure.singleSupplement.toString()),
                },
                { label: 'Tour leader', value: departure.tourLeaderName ?? '—' },
                {
                  label: 'Template',
                  value: departure.template ? (
                    <Link
                      href={`/group-trips/${departure.template.id}`}
                      className="text-voya-800 hover:underline"
                    >
                      {departure.template.name}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
            {departure.notes ? (
              <p className="mt-4 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">
                {departure.notes}
              </p>
            ) : null}
          </Card>

          <DepartureControls
            departureId={departure.id}
            capacity={departure.capacity}
            status={departure.status}
            costPerSeat={departure.costPerSeat.toString()}
            showCost={showCost}
          />

          {departure.itineraryDays.length > 0 ? (
            <Card title="Itinerary" description="Copied from the template when created.">
              <ol className="space-y-3">
                {departure.itineraryDays.map((day) => (
                  <li key={day.id}>
                    <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Day {day.dayNumber}
                    </p>
                    <p className="text-sm font-medium text-slate-800">{day.title}</p>
                    {day.description ? (
                      <p className="text-sm text-slate-600">{day.description}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
