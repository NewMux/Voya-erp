import { canSeeFinancials, requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { today, toInputDate } from '@/lib/dates';
import { PageHeader } from '@/components/ui';
import { lookupCustomers } from '@/server/actions/lookup.actions';
import { BookingForm, type DepartureOption, type SupplierOption } from './booking-form';
import type { PickerCustomer } from './customer-picker';

export const metadata = { title: 'New booking' };
export const dynamic = 'force-dynamic';

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; departureId?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);

  const [suppliers, departures] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, defaultCurrency: true },
    }),
    prisma.groupDeparture.findMany({
      // Only trips that can still take a booking.
      where: { status: { in: ['OPEN', 'FULL'] }, departureDate: { gte: today() } },
      orderBy: { departureDate: 'asc' },
      select: {
        id: true,
        name: true,
        departureDate: true,
        capacity: true,
        seatsBooked: true,
        pricePerSeat: true,
        singleSupplement: true,
        costPerSeat: true,
      },
    }),
  ]);

  // Pre-select the customer when arriving from their page.
  let initialCustomer: PickerCustomer | null = null;
  if (query.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: query.customerId },
      select: { membership: { select: { membershipNumber: true } }, fullName: true },
    });
    if (customer) {
      const matches = await lookupCustomers(
        customer.membership?.membershipNumber ?? customer.fullName,
      );
      initialCustomer = matches.find((c) => c.id === query.customerId) ?? null;
    }
  }

  const showCost = canSeeFinancials(user.role);
  const departureOptions: DepartureOption[] = departures.map((departure) => ({
    id: departure.id,
    name: departure.name,
    departureDate: toInputDate(departure.departureDate),
    capacity: departure.capacity,
    seatsBooked: departure.seatsBooked,
    pricePerSeat: departure.pricePerSeat.toString(),
    singleSupplement: departure.singleSupplement.toString(),
    // Never sent to a role that cannot see cost, not even hidden in props.
    costPerSeat: showCost ? departure.costPerSeat.toString() : '0',
  }));

  const supplierOptions: SupplierOption[] = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    type: supplier.type,
    defaultCurrency: supplier.defaultCurrency,
  }));

  return (
    <>
      <PageHeader
        title="New booking"
        description="Every booking type supports a deposit and a dated balance."
      />
      <BookingForm
        suppliers={supplierOptions}
        departures={departureOptions}
        initialCustomer={initialCustomer}
        canSeeCost={showCost}
      />
    </>
  );
}
