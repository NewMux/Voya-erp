import { requireRole } from '@/server/guards';
import { createSupplier } from '@/server/actions/supplier.actions';
import { PageHeader } from '@/components/ui';
import { SupplierForm } from '../supplier-form';

export const metadata = { title: 'New supplier' };

export default async function NewSupplierPage() {
  await requireRole('ADMIN', 'ACCOUNTANT');

  return (
    <>
      <PageHeader title="New supplier" />
      <SupplierForm action={createSupplier} submitLabel="Create supplier" />
    </>
  );
}
