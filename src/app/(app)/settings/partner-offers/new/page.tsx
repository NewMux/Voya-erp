import { requireRole } from '@/server/guards';
import { createPartnerOffer } from '@/server/actions/partner-offer.actions';
import { PageHeader } from '@/components/ui';
import { PartnerOfferForm } from '../partner-offer-form';

export const metadata = { title: 'New partner offer' };

export default async function NewPartnerOfferPage() {
  await requireRole('ADMIN');

  return (
    <>
      <PageHeader title="New partner offer" />
      <PartnerOfferForm action={createPartnerOffer} submitLabel="Add partner offer" />
    </>
  );
}
