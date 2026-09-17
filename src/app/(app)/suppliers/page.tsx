import Link from 'next/link';
import { requireRole } from '@/server/guards';
import { suppliersWithBalances } from '@/server/services/supplier.service';
import { formatMoney } from '@/lib/money';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { humanise } from '@/components/status';

export const metadata = { title: 'Suppliers' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  // Supplier terms and balances are commercial data; reservations staff see
  // supplier names on bookings but do not manage them here.
  await requireRole('ADMIN', 'ACCOUNTANT');
  const suppliers = await suppliersWithBalances();

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Rates, commission, payment terms and outstanding balances."
        actions={<LinkButton href="/suppliers/new">New supplier</LinkButton>}
      />

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            description="Add the airlines, hotels, DMCs and visa agents you book through."
            action={<LinkButton href="/suppliers/new">New supplier</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Terms</Th>
                <Th>Commission</Th>
                <Th className="text-right">Bookings</Th>
                <Th className="text-right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/suppliers/${supplier.id}`}
                      className="font-medium text-voya-800 hover:underline"
                    >
                      {supplier.name}
                    </Link>
                    {!supplier.isActive ? (
                      <Badge className="ml-2" tone="neutral">
                        Archived
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>{humanise(supplier.type)}</Td>
                  <Td className="whitespace-nowrap">
                    {supplier.paymentTerms === 'CREDIT'
                      ? `Credit · net ${supplier.creditDays ?? '—'}`
                      : 'Prepaid'}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {supplier.commissionType === 'FIXED_PERCENT'
                      ? `${supplier.commissionValue.toString()}%`
                      : supplier.commissionType === 'FIXED_AMOUNT'
                        ? formatMoney(supplier.commissionValue.toString(), supplier.defaultCurrency)
                        : '—'}
                  </Td>
                  <Td className="text-right tabular-nums">{supplier._count.bookings}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(supplier.outstanding, 'BHD', { withCode: false })}
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
