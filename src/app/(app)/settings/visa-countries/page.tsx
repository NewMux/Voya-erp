import Link from 'next/link';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/money';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { ToggleActiveButton } from './toggle-active-button';

export const metadata = { title: 'Visa countries' };
export const dynamic = 'force-dynamic';

export default async function VisaCountriesPage() {
  await requireRole('ADMIN');

  const countries = await prisma.visaCountryReference.findMany({
    orderBy: { country: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Visa countries"
        description="Embassy, fee, required documents, terms and processing time — looked up automatically when staff start a Visa booking."
        actions={<LinkButton href="/settings/visa-countries/new">New country</LinkButton>}
      />

      <Card>
        {countries.length === 0 ? (
          <EmptyState
            title="No countries set up yet"
            description="Add the destinations Voya handles visas for."
            action={<LinkButton href="/settings/visa-countries/new">New country</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Country</Th>
                <Th>Embassy</Th>
                <Th className="text-right">Fee</Th>
                <Th className="text-right">Processing</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {countries.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/settings/visa-countries/${row.id}/edit`}
                      className="font-medium text-voya-800 hover:underline"
                    >
                      {row.country}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">{row.embassyName ?? '—'}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.visaFeeAmount.toString(), row.visaFeeCurrency)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.processingTimeDays ? `${row.processingTimeDays}d` : '—'}
                  </Td>
                  <Td>
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td>
                    <ToggleActiveButton id={row.id} isActive={row.isActive} />
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
