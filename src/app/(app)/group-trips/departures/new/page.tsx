import { requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui';
import { DepartureForm } from '../../forms';

export const metadata = { title: 'New departure' };
export const dynamic = 'force-dynamic';

export default async function NewDeparturePage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const [, query] = await Promise.all([requireUser(), searchParams]);

  const templates = await prisma.groupTripTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, destination: true, durationDays: true },
  });

  return (
    <>
      <PageHeader
        title="New departure"
        description="Seats, pricing and the capacity limit for one dated trip."
      />
      <DepartureForm templates={templates} defaultTemplateId={query.templateId} />
    </>
  );
}
