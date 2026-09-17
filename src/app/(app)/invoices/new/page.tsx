import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { lookupCustomers } from '@/server/actions/lookup.actions';
import { PageHeader } from '@/components/ui';
import { InvoiceBuilder } from './invoice-builder';
import type { PickerCustomer } from '../../bookings/new/customer-picker';

export const metadata = { title: 'New invoice' };
export const dynamic = 'force-dynamic';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; bookingId?: string }>;
}) {
  await requireRole('ADMIN', 'ACCOUNTANT');
  const query = await searchParams;

  // Arriving from a booking pre-selects that booking's customer.
  let customerId = query.customerId;
  if (!customerId && query.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: query.bookingId },
      select: { customerId: true },
    });
    customerId = booking?.customerId;
  }

  let initialCustomer: PickerCustomer | null = null;
  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { fullName: true, membership: { select: { membershipNumber: true } } },
    });
    if (customer) {
      const matches = await lookupCustomers(
        customer.membership?.membershipNumber ?? customer.fullName,
      );
      initialCustomer = matches.find((c) => c.id === customerId) ?? null;
    }
  }

  return (
    <>
      <PageHeader
        title="New invoice"
        description="Bundle one or more bookings for the same customer."
      />
      <InvoiceBuilder
        initialCustomer={initialCustomer}
        preselectedBookingId={query.bookingId}
      />
    </>
  );
}
