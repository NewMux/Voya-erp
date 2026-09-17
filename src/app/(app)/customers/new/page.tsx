import { requireUser } from '@/server/guards';
import { createCustomer } from '@/server/actions/customer.actions';
import { PageHeader } from '@/components/ui';
import { CustomerForm } from '../customer-form';

export const metadata = { title: 'New customer' };

export default async function NewCustomerPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="New customer" description="Create a customer record." />
      <CustomerForm action={createCustomer} submitLabel="Create customer" />
    </>
  );
}
