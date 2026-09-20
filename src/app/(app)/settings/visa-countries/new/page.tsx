import { requireRole } from '@/server/guards';
import { createVisaCountry } from '@/server/actions/visa.actions';
import { PageHeader } from '@/components/ui';
import { VisaCountryForm } from '../visa-country-form';

export const metadata = { title: 'New visa country' };

export default async function NewVisaCountryPage() {
  await requireRole('ADMIN');

  return (
    <>
      <PageHeader title="New visa country" />
      <VisaCountryForm action={createVisaCountry} submitLabel="Add country" />
    </>
  );
}
