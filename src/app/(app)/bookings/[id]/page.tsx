import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canSeeFinancials, requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { bookingBalance } from '@/server/services/booking.service';
import { formatDate, toInputDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  Alert,
  Badge,
  Card,
  DescriptionList,
  LinkButton,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import {
  BookingStatusBadge,
  humanise,
  PaymentStatusBadge,
  ScheduleStatusBadge,
} from '@/components/status';
import { AttachmentsPanel, RescheduleForm, StatusControl, TravelersPanel } from './panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: booking?.reference ?? 'Booking' };
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const showMoney = canSeeFinancials(user.role);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: { include: { membership: true } },
      supplier: true,
      supplierRateSheet: true,
      createdBy: { select: { name: true } },
      flightDetail: true,
      hotelDetail: true,
      visaDetail: true,
      transportDetail: true,
      groupDetail: { include: { departure: true } },
      packageComponents: { orderBy: { sortOrder: 'asc' } },
      travelers: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'desc' } },
      scheduleItems: { orderBy: { dueDate: 'asc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
      allocations: { include: { payment: true } },
      invoiceLines: { include: { invoice: { select: { id: true, number: true, status: true } } } },
    },
  });
  if (!booking) notFound();

  const balance = bookingBalance(booking);

  return (
    <>
      <PageHeader
        title={booking.reference}
        description={`${humanise(booking.type)} · created by ${booking.createdBy?.name ?? 'system'}`}
        actions={
          <>
            <BookingStatusBadge status={booking.status} />
            <PaymentStatusBadge status={booking.paymentStatus} />
            {booking.status !== 'CANCELLED' ? (
              <LinkButton href={`/invoices/new?bookingId=${booking.id}`} variant="secondary">
                Create invoice
              </LinkButton>
            ) : null}
          </>
        }
      />

      {booking.status === 'CANCELLED' ? (
        <div className="mb-6">
          <Alert tone="danger" title="This booking is cancelled">
            {booking.cancelReason ?? 'No reason recorded.'}
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Customer pays" value={formatMoney(booking.netSellingAmount.toString())} />
        <Stat
          label="Balance"
          value={formatMoney(balance)}
          tone={Number.parseFloat(balance) > 0 ? 'danger' : 'neutral'}
        />
        {showMoney ? (
          <>
            <Stat label="Cost (BHD)" value={formatMoney(booking.costAmountBase.toString())} />
            <Stat
              label="Margin"
              value={formatMoney(booking.marginAmount.toString())}
              tone={Number.parseFloat(booking.marginAmount.toString()) < 0 ? 'danger' : 'neutral'}
            />
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Booking">
            <DescriptionList
              items={[
                {
                  label: 'Customer',
                  value: (
                    <Link
                      href={`/customers/${booking.customer.id}`}
                      className="text-voya-800 hover:underline"
                    >
                      {booking.customer.fullName}
                    </Link>
                  ),
                },
                {
                  label: 'Membership',
                  value: booking.customer.membership ? (
                    <Badge tone="gold">{booking.customer.membership.membershipNumber}</Badge>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: 'Supplier',
                  value: booking.supplier ? (
                    <Link
                      href={`/suppliers/${booking.supplier.id}`}
                      className="text-voya-800 hover:underline"
                    >
                      {booking.supplier.name}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: 'Rate sheet',
                  value: booking.supplierRateSheet
                    ? `v${booking.supplierRateSheet.version} · ${booking.supplierRateSheet.name}`
                    : '—',
                },
                { label: 'Departure', value: formatDate(booking.departureDate) },
                { label: 'Return', value: formatDate(booking.returnDate) },
                {
                  label: 'Travellers',
                  value: `${booking.adults} adult${booking.adults === 1 ? '' : 's'}${
                    booking.children ? `, ${booking.children} child` : ''
                  }${booking.infants ? `, ${booking.infants} infant` : ''}`,
                },
              ]}
            />

            {booking.notes ? (
              <p className="mt-4 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">
                {booking.notes}
              </p>
            ) : null}
          </Card>

          <TypeDetailCard booking={booking} />

          <Card
            title="Payment plan"
            description="Deposit and balance. Status rolls up from recorded payments."
          >
            {booking.scheduleItems.length === 0 ? (
              <p className="text-sm text-slate-500">No payment plan on this booking.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Instalment</Th>
                    <Th>Due</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Paid</Th>
                    <Th>Status</Th>
                    {showMoney ? <Th>Reschedule</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {booking.scheduleItems.map((item) => (
                    <tr key={item.id}>
                      <Td>{humanise(item.kind)}</Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(item.dueDate)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(item.amountDue.toString(), 'BHD', { withCode: false })}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(item.paidAmount.toString(), 'BHD', { withCode: false })}
                      </Td>
                      <Td>
                        <ScheduleStatusBadge status={item.status} />
                      </Td>
                      {showMoney ? (
                        <Td>
                          {item.status === 'PENDING' || item.status === 'PARTIALLY_PAID' ? (
                            <RescheduleForm
                              bookingId={booking.id}
                              scheduleItemId={item.id}
                              dueDate={toInputDate(item.dueDate)}
                            />
                          ) : null}
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {booking.allocations.length > 0 ? (
            <Card title="Payments received">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th>Reference</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {booking.allocations.map((allocation) => (
                    <tr key={allocation.id}>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(allocation.payment.paidAt)}
                      </Td>
                      <Td>{humanise(allocation.payment.method)}</Td>
                      <Td className="text-slate-600">{allocation.payment.reference ?? '—'}</Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(allocation.amount.toString(), 'BHD', { withCode: false })}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}

          {booking.refunds.length > 0 ? (
            <Card title="Refunds">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Reason</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {booking.refunds.map((refund) => (
                    <tr key={refund.id}>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(refund.processedAt ?? refund.createdAt)}
                      </Td>
                      <Td className="text-slate-600">{refund.reason ?? '—'}</Td>
                      <Td>
                        <Badge
                          tone={
                            refund.status === 'PROCESSED'
                              ? 'success'
                              : refund.status === 'REJECTED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {humanise(refund.status)}
                        </Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(refund.amount.toString(), 'BHD', { withCode: false })}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}

          <TravelersPanel bookingId={booking.id} travelers={booking.travelers} />
        </div>

        <div className="space-y-6">
          <StatusControl bookingId={booking.id} status={booking.status} />

          {showMoney ? (
            <Card title="Financials">
              <DescriptionList
                items={[
                  {
                    label: 'Selling price',
                    value: formatMoney(booking.sellingAmount.toString()),
                  },
                  {
                    label: 'Member discount',
                    value:
                      Number.parseFloat(booking.membershipDiscountAmount.toString()) > 0
                        ? `−${formatMoney(booking.membershipDiscountAmount.toString())} (${booking.membershipDiscountPercent.toString()}%)`
                        : '—',
                  },
                  {
                    label: 'Cost price',
                    value: `${formatMoney(booking.costAmount.toString(), booking.costCurrency)}${
                      booking.costCurrency !== 'BHD'
                        ? ` @ ${booking.fxRate.toString()}`
                        : ''
                    }`,
                  },
                  {
                    label: 'Cost in BHD',
                    value: formatMoney(booking.costAmountBase.toString()),
                  },
                  { label: 'Margin', value: formatMoney(booking.marginAmount.toString()) },
                ]}
              />
              <p className="mt-3 text-xs text-slate-500">
                Cost and margin never appear on customer documents.
              </p>
            </Card>
          ) : null}

          {booking.invoiceLines.length > 0 ? (
            <Card title="Invoices">
              <ul className="space-y-2">
                {booking.invoiceLines.map((line) => (
                  <li key={line.id}>
                    {line.invoice ? (
                      <Link
                        href={`/invoices/${line.invoice.id}`}
                        className="text-sm text-voya-800 hover:underline"
                      >
                        {line.invoice.number}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <AttachmentsPanel bookingId={booking.id} attachments={booking.attachments} />
        </div>
      </div>
    </>
  );
}

/** The detail card matching the booking's type. */
function TypeDetailCard({
  booking,
}: {
  booking: {
    type: string;
    flightDetail: {
      airline: string;
      pnr: string | null;
      routeFrom: string;
      routeTo: string;
      cabinClass: string | null;
      baggageAllowance: string | null;
    } | null;
    hotelDetail: {
      propertyName: string;
      city: string | null;
      roomType: string | null;
      boardBasis: string;
      checkIn: Date;
      checkOut: Date;
      rooms: number;
    } | null;
    visaDetail: {
      destinationCountry: string;
      visaType: string;
      processingStatus: string;
    } | null;
    transportDetail: {
      kind: string;
      pickupLocation: string;
      dropoffLocation: string | null;
      vehicleType: string | null;
    } | null;
    groupDetail: {
      seats: number;
      singleSupplementSeats: number;
      pricePerSeat: { toString(): string };
      departure: { id: string; name: string; departureDate: Date };
    } | null;
    packageComponents: Array<{ id: string; kind: string; description: string }>;
  };
}) {
  if (booking.flightDetail) {
    const flight = booking.flightDetail;
    return (
      <Card title="Flight">
        <DescriptionList
          items={[
            { label: 'Airline', value: flight.airline },
            { label: 'PNR', value: flight.pnr ?? '—' },
            { label: 'Route', value: `${flight.routeFrom} → ${flight.routeTo}` },
            { label: 'Class', value: flight.cabinClass ?? '—' },
            { label: 'Baggage', value: flight.baggageAllowance ?? '—' },
          ]}
        />
      </Card>
    );
  }

  if (booking.hotelDetail) {
    const hotel = booking.hotelDetail;
    return (
      <Card title="Hotel">
        <DescriptionList
          items={[
            { label: 'Property', value: hotel.propertyName },
            { label: 'City', value: hotel.city ?? '—' },
            { label: 'Room type', value: hotel.roomType ?? '—' },
            { label: 'Board basis', value: hotel.boardBasis },
            { label: 'Check-in', value: formatDate(hotel.checkIn) },
            { label: 'Check-out', value: formatDate(hotel.checkOut) },
            { label: 'Rooms', value: String(hotel.rooms) },
          ]}
        />
      </Card>
    );
  }

  if (booking.visaDetail) {
    const visa = booking.visaDetail;
    return (
      <Card title="Visa">
        <DescriptionList
          items={[
            { label: 'Destination', value: visa.destinationCountry },
            { label: 'Visa type', value: visa.visaType },
            { label: 'Processing', value: humanise(visa.processingStatus) },
          ]}
        />
      </Card>
    );
  }

  if (booking.transportDetail) {
    const transport = booking.transportDetail;
    return (
      <Card title="Transport">
        <DescriptionList
          items={[
            { label: 'Type', value: humanise(transport.kind) },
            { label: 'Pickup', value: transport.pickupLocation },
            { label: 'Drop-off', value: transport.dropoffLocation ?? '—' },
            { label: 'Vehicle', value: transport.vehicleType ?? '—' },
          ]}
        />
      </Card>
    );
  }

  if (booking.groupDetail) {
    const group = booking.groupDetail;
    return (
      <Card title="Group Adventure">
        <DescriptionList
          items={[
            {
              label: 'Departure',
              value: (
                <Link
                  href={`/group-trips/departures/${group.departure.id}`}
                  className="text-voya-800 hover:underline"
                >
                  {group.departure.name}
                </Link>
              ),
            },
            { label: 'Travel date', value: formatDate(group.departure.departureDate) },
            { label: 'Seats', value: String(group.seats) },
            { label: 'Single supplement seats', value: String(group.singleSupplementSeats) },
            { label: 'Price per seat', value: formatMoney(group.pricePerSeat.toString()) },
          ]}
        />
      </Card>
    );
  }

  if (booking.type === 'PACKAGE') {
    return (
      <Card title="Package components">
        {booking.packageComponents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No components recorded. The package is sold under one price.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {booking.packageComponents.map((component) => (
              <li key={component.id} className="py-2 text-sm">
                <span className="font-medium text-slate-800">{humanise(component.kind)}</span>
                <span className="text-slate-600"> · {component.description}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return null;
}
