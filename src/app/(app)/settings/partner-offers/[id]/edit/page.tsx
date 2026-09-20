import { notFound } from 'next/navigation';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { updatePartnerOffer } from '@/server/actions/partner-offer.actions';
import { PageHeader } from '@/components/ui';
import { PartnerOfferForm } from '../../partner-offer-form';

export const metadata = { title: 'Edit partner offer' };

export default async function EditPartnerOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;

  const offer = await prisma.partnerOffer.findUnique({ where: { id } });
  if (!offer) notFound();

  return (
    <>
      <PageHeader title={`Edit ${offer.name}`} />
      <PartnerOfferForm action={updatePartnerOffer} offer={offer} submitLabel="Save changes" />
    </>
  );
}
