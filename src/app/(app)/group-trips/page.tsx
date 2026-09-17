import Link from 'next/link';
import { requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { formatDate, today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { DepartureStatusBadge } from '@/components/status';

export const metadata = { title: 'Group Adventures' };
export const dynamic = 'force-dynamic';

export default async function GroupTripsPage() {
  await requireUser();

  const [templates, departures] = await Promise.all([
    prisma.groupTripTemplate.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { departures: true, itineraryDays: true } } },
    }),
    prisma.groupDeparture.findMany({
      orderBy: { departureDate: 'asc' },
      take: 100,
      include: { _count: { select: { waitlist: true } } },
    }),
  ]);

  const now = today();
  const upcoming = departures.filter((d) => d.departureDate.getTime() >= now.getTime());
  const past = departures.filter((d) => d.departureDate.getTime() < now.getTime());

  return (
    <>
      <PageHeader
        title="Group Adventures"
        description="Voya's signature multi-day group trips: fixed itinerary, capacity limit, per-seat pricing."
        actions={
          <>
            <LinkButton href="/group-trips/departures/new">New departure</LinkButton>
            <LinkButton href="/group-trips/new" variant="secondary">
              New trip template
            </LinkButton>
          </>
        }
      />

      <div className="space-y-6">
        <Card title="Upcoming departures" description="Live seat counts.">
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming departures"
              description="Create a departure to start selling seats."
              action={<LinkButton href="/group-trips/departures/new">New departure</LinkButton>}
            />
          ) : (
            <DepartureTable departures={upcoming} />
          )}
        </Card>

        <Card
          title="Trip templates"
          description="Reusable itineraries for repeat departures."
        >
          {templates.length === 0 ? (
            <EmptyState
              title="No templates yet"
              description="A template holds the day-by-day itinerary so repeat departures need no retyping."
              action={
                <LinkButton href="/group-trips/new" variant="secondary">
                  New trip template
                </LinkButton>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/group-trips/${template.id}`}
                      className="font-medium text-voya-800 hover:underline"
                    >
                      {template.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {template.destination ?? 'No destination set'} · {template.durationDays} days
                      · {template._count.itineraryDays} itinerary entries
                    </p>
                  </div>
                  <Badge tone="neutral">
                    {template._count.departures} departure
                    {template._count.departures === 1 ? '' : 's'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {past.length > 0 ? (
          <Card title="Past departures">
            <DepartureTable departures={past} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

type DepartureRow = {
  id: string;
  name: string;
  departureDate: Date;
  capacity: number;
  seatsBooked: number;
  pricePerSeat: { toString(): string };
  status: 'DRAFT' | 'OPEN' | 'FULL' | 'CLOSED' | 'COMPLETED' | 'CANCELLED';
  _count: { waitlist: number };
};

function DepartureTable({ departures }: { departures: DepartureRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Departure</Th>
          <Th>Date</Th>
          <Th className="text-right">Seats</Th>
          <Th className="text-right">Per seat</Th>
          <Th>Waitlist</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {departures.map((departure) => {
          const remaining = Math.max(0, departure.capacity - departure.seatsBooked);
          const percent =
            departure.capacity > 0
              ? Math.round((departure.seatsBooked / departure.capacity) * 100)
              : 0;

          return (
            <tr key={departure.id} className="hover:bg-slate-50">
              <Td>
                <Link
                  href={`/group-trips/departures/${departure.id}`}
                  className="font-medium text-voya-800 hover:underline"
                >
                  {departure.name}
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-slate-600">
                {formatDate(departure.departureDate)}
              </Td>
              <Td className="text-right">
                <span className="tabular-nums">
                  {departure.seatsBooked}/{departure.capacity}
                </span>
                <Badge
                  className="ml-2"
                  tone={remaining === 0 ? 'warning' : percent >= 80 ? 'warning' : 'success'}
                >
                  {remaining === 0 ? 'Full' : `${remaining} left`}
                </Badge>
              </Td>
              <Td className="text-right tabular-nums">
                {formatMoney(departure.pricePerSeat.toString(), 'BHD', { withCode: false })}
              </Td>
              <Td className="tabular-nums">
                {departure._count.waitlist > 0 ? departure._count.waitlist : '—'}
              </Td>
              <Td>
                <DepartureStatusBadge status={departure.status} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
