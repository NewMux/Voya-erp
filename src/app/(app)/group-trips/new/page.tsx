import { requireUser } from '@/server/guards';
import { PageHeader } from '@/components/ui';
import { TripTemplateForm } from '../forms';

export const metadata = { title: 'New trip template' };

export default async function NewTripTemplatePage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="New trip template"
        description="A reusable itinerary. Repeat departures copy it, so later edits never rewrite trips already sold."
      />
      <TripTemplateForm />
    </>
  );
}
