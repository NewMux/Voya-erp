import { notFound } from 'next/navigation';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { updateSupplier } from '@/server/actions/supplier.actions';
import { PageHeader } from '@/components/ui';
import { SupplierForm } from '../../supplier-form';

export const metadata = { title: 'Edit supplier' };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN', 'ACCOUNTANT');
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  return (
    <>
      <PageHeader title={`Edit ${supplier.name}`} />
      <SupplierForm action={updateSupplier} supplier={supplier} submitLabel="Save changes" />
    </>
  );
}
