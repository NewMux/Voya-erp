import { canSeeFinancials, requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui';
import { lookupCustomers } from '@/server/actions/lookup.actions';
import { VisaBookingForm } from './visa-booking-form';
import type { PickerCustomer } from '../customer-picker';

export const metadata = { title: 'New visa booking' };
export const dynamic = 'force-dynamic';

export default async function NewVisaBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);

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

  return (
    <>
      <PageHeader
        title="New visa booking"
        description="Pick a destination country to pull embassy, fee and document requirements automatically."
      />
      <VisaBookingForm
        initialCustomer={initialCustomer}
        canSeeCost={canSeeFinancials(user.role)}
      />
    </>
  );
}
