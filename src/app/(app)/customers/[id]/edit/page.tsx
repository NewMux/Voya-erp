import { notFound } from 'next/navigation';
import { requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { updateCustomer } from '@/server/actions/customer.actions';
import { PageHeader } from '@/components/ui';
import { CustomerForm } from '../../customer-form';

export const metadata = { title: 'Edit customer' };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <>
      <PageHeader title={`Edit ${customer.fullName}`} />
      <CustomerForm action={updateCustomer} customer={customer} submitLabel="Save changes" />
    </>
  );
}
