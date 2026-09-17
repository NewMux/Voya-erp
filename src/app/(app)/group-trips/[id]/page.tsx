import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { DepartureStatusBadge } from '@/components/status';
import { ItineraryDayForm } from '../forms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await prisma.groupTripTemplate.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: template?.name ?? 'Trip template' };
}

export default async function TripTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const template = await prisma.groupTripTemplate.findUnique({
    where: { id },
    include: {
      itineraryDays: { orderBy: { dayNumber: 'asc' } },
      departures: { orderBy: { departureDate: 'desc' } },
    },
  });
  if (!template) notFound();

  return (
    <>
      <PageHeader
        title={template.name}
        description={`${template.destination ?? 'No destination set'} · ${template.durationDays} days`}
        actions={
          <LinkButton href={`/group-trips/departures/new?templateId=${template.id}`}>
            New departure from this template
          </LinkButton>
        }
      />

      {template.summary ? (
        <div className="mb-6">
          <Card>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{template.summary}</p>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card
          title="Itinerary"
          description="Edits here apply to future departures only; existing ones keep the itinerary they were sold with."
        >
          <div className="divide-y divide-slate-100">
            {template.itineraryDays.map((day) => (
              <ItineraryDayForm key={day.id} templateId={template.id} day={day} />
            ))}
          </div>
        </Card>

        <Card title="Departures">
          {template.departures.length === 0 ? (
            <EmptyState
              title="No departures yet"
              description="Create one to start selling seats on this trip."
              action={
                <LinkButton href={`/group-trips/departures/new?templateId=${template.id}`}>
                  New departure
                </LinkButton>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Departure</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Seats</Th>
                  <Th className="text-right">Per seat</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {template.departures.map((departure) => (
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
                      {departure.seatsBooked >= departure.capacity ? (
                        <Badge className="ml-2" tone="warning">
                          Full
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(departure.pricePerSeat.toString(), 'BHD', { withCode: false })}
                    </Td>
                    <Td>
                      <DepartureStatusBadge status={departure.status} />
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
