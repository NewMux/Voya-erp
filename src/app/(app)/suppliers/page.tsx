import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma, SupplierType } from '@prisma/client';
import { requireRole } from '@/server/guards';
import { suppliersWithBalances } from '@/server/services/supplier.service';
import { formatMoney } from '@/lib/money';
import {
  Badge,
  Card,
  CountryField,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { humanise } from '@/components/status';

export const metadata = { title: 'Suppliers' };
export const dynamic = 'force-dynamic';

const SUPPLIER_TYPES: SupplierType[] = ['AIRLINE', 'HOTEL', 'DMC', 'TRANSPORT', 'VISA_AGENT'];

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; country?: string }>;
}) {
  // Supplier terms and balances are commercial data; reservations staff see
  // supplier names on bookings but do not manage them here.
  await requireRole('ADMIN', 'ACCOUNTANT');
  const query = await searchParams;

  const where: Prisma.SupplierWhereInput = {};
  if (query.q?.trim()) {
    where.name = { contains: query.q.trim(), mode: 'insensitive' };
  }
  if (query.type && SUPPLIER_TYPES.includes(query.type as SupplierType)) {
    where.type = query.type as SupplierType;
  }
  if (query.country?.trim()) {
    where.country = { equals: query.country.trim(), mode: 'insensitive' };
  }

  const suppliers = await suppliersWithBalances(undefined, where);
  const hasFilter = Boolean(query.q || query.type || query.country);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Rates, commission, payment terms and outstanding balances."
        actions={<LinkButton href="/suppliers/new">New supplier</LinkButton>}
      />

      <Card>
        <form method="get" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={query.q ?? ''}
              placeholder="Supplier name"
              className="pl-9"
              aria-label="Search suppliers"
            />
          </div>
          <Select name="type" defaultValue={query.type ?? ''} aria-label="Filter by type">
            <option value="">All types</option>
            {SUPPLIER_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanise(type)}
              </option>
            ))}
          </Select>
          <CountryField
            name="country"
            defaultValue={query.country ?? ''}
            placeholder="Any country"
            aria-label="Filter by country"
          />
          <div className="flex gap-2 sm:col-span-4">
            <button
              type="submit"
              className="rounded-md bg-voya-400 px-3.5 py-2 text-sm font-medium text-white hover:bg-voya-500"
            >
              Apply
            </button>
            <LinkButton href="/suppliers" variant="ghost">
              Reset
            </LinkButton>
          </div>
        </form>

        {suppliers.length === 0 ? (
          <EmptyState
            title={hasFilter ? 'No suppliers match those filters' : 'No suppliers yet'}
            description={
              hasFilter
                ? undefined
                : 'Add the airlines, hotels, DMCs and visa agents you book through.'
            }
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
