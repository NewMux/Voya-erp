import Link from 'next/link';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/dates';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { ToggleActiveButton } from './toggle-active-button';

export const metadata = { title: 'Partner offers' };
export const dynamic = 'force-dynamic';

export default async function PartnerOffersPage() {
  await requireRole('ADMIN');

  const offers = await prisma.partnerOffer.findMany({
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Partner offers"
        description="Membership benefits from partner businesses — discounts and perks Voya members can redeem."
        actions={
          <>
            <LinkButton href="/api/partner-offers/directory" variant="secondary" target="_blank">
              Print directory
            </LinkButton>
            <LinkButton href="/settings/partner-offers/new">New partner offer</LinkButton>
          </>
        }
      />

      <Card>
        {offers.length === 0 ? (
          <EmptyState
            title="No partner offers yet"
            description="Add the businesses offering discounts to Voya members."
            action={<LinkButton href="/settings/partner-offers/new">New partner offer</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Partner</Th>
                <Th>Country</Th>
                <Th>Agreement period</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/settings/partner-offers/${offer.id}/edit`}
                      className="font-medium text-voya-800 hover:underline"
                    >
                      {offer.name}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">{offer.country ?? '—'}</Td>
                  <Td className="text-slate-600">
                    {formatDate(offer.agreementStart)} – {formatDate(offer.agreementEnd)}
                  </Td>
                  <Td>
                    <Badge tone={offer.isActive ? 'success' : 'neutral'}>
                      {offer.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td>
                    <ToggleActiveButton id={offer.id} isActive={offer.isActive} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
