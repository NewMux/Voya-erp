import { notFound } from 'next/navigation';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { updateVisaCountry } from '@/server/actions/visa.actions';
import { PageHeader } from '@/components/ui';
import { VisaCountryForm } from '../../visa-country-form';

export const metadata = { title: 'Edit visa country' };

export default async function EditVisaCountryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;

  const reference = await prisma.visaCountryReference.findUnique({ where: { id } });
  if (!reference) notFound();

  return (
    <>
      <PageHeader title={`Edit ${reference.country}`} />
      <VisaCountryForm action={updateVisaCountry} reference={reference} submitLabel="Save changes" />
    </>
  );
}
