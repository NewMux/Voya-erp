import Link from 'next/link';
import { Search } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { formatDate, today } from '@/lib/dates';
import { add, formatMoney, subtract, toStorage } from '@/lib/money';
import {
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { InvoiceStatusBadge } from '@/components/status';

export const metadata = { title: 'Invoices' };
export const dynamic = 'force-dynamic';

const STATUSES = [
  'DRAFT',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireRole('ADMIN', 'ACCOUNTANT');
  const query = await searchParams;

  const where: Prisma.InvoiceWhereInput = {};

  if (query.q?.trim()) {
    const term = query.q.trim();
    where.OR = [
      { number: { contains: term, mode: 'insensitive' } },
      { customer: { fullName: { contains: term, mode: 'insensitive' } } },
    ];
  }
  if (query.status && STATUSES.includes(query.status as never)) {
    where.status = query.status as (typeof STATUSES)[number];
  }

  const [invoices, outstanding] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      take: 100,
      include: { customer: { select: { id: true, fullName: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { total: true, paidAmount: true, dueDate: true },
    }),
  ]);

  const now = today();
  const outstandingTotal = outstanding.reduce(
    (total, invoice) => add(total, subtract(invoice.total, invoice.paidAmount)),
    add(0),
  );
  const overdueTotal = outstanding
    .filter((invoice) => invoice.dueDate.getTime() < now.getTime())
    .reduce((total, invoice) => add(total, subtract(invoice.total, invoice.paidAmount)), add(0));

  return (
    <>
      <PageHeader
        title="Invoices"
        description="One invoice can bundle several bookings for the same customer."
        actions={<LinkButton href="/invoices/new">New invoice</LinkButton>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatMoney(toStorage(outstandingTotal))} />
        <Stat
          label="Overdue"
          value={formatMoney(toStorage(overdueTotal))}
          tone={Number.parseFloat(toStorage(overdueTotal)) > 0 ? 'danger' : 'neutral'}
        />
        <Stat label="Open invoices" value={String(outstanding.length)} />
      </div>

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
              placeholder="Invoice number or customer"
              className="pl-9"
              aria-label="Search invoices"
            />
          </div>
          <Select name="status" defaultValue={query.status ?? ''} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-voya-400 px-3.5 py-2 text-sm font-medium text-white hover:bg-voya-500"
            >
              Apply
            </button>
            <LinkButton href="/invoices" variant="ghost">
              Reset
            </LinkButton>
          </div>
        </form>

        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            action={<LinkButton href="/invoices/new">New invoice</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-medium text-voya-800 hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </Td>
                  <Td className="max-w-[12rem] truncate">
                    <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
                      {invoice.customer.fullName}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">
                    {formatDate(invoice.issueDate)}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">
                    {formatDate(invoice.dueDate)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(invoice.total.toString(), 'BHD', { withCode: false })}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(
                      toStorage(subtract(invoice.total, invoice.paidAmount)),
                      'BHD',
                      { withCode: false },
                    )}
                  </Td>
                  <Td>
                    <InvoiceStatusBadge status={invoice.status} />
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
