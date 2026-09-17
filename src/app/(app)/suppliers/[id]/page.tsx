import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import {
  nextRateSheetVersion,
  supplierBalance,
  supplierReconciliation,
} from '@/server/services/supplier.service';
import { addDays, formatDate, toInputDate, today } from '@/lib/dates';
import { formatMoney, subtract, toStorage } from '@/lib/money';
import {
  Badge,
  Card,
  DescriptionList,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { humanise, SupplierInvoiceStatusBadge } from '@/components/status';
import {
  ArchiveSupplierButton,
  RateSheetForm,
  SupplierInvoiceActions,
  SupplierInvoiceForm,
} from './panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { name: true } });
  return { title: supplier?.name ?? 'Supplier' };
}

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole('ADMIN', 'ACCOUNTANT');
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      rateSheets: { orderBy: { version: 'desc' } },
      invoices: { orderBy: { issueDate: 'desc' }, take: 50 },
    },
  });
  if (!supplier) notFound();

  // Reconciliation defaults to the last 90 days of travel.
  const defaultTo = addDays(today(), 30);
  const defaultFrom = addDays(today(), -90);
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : defaultFrom;
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : defaultTo;

  const [balance, nextVersion, reconciliation] = await Promise.all([
    supplierBalance(prisma, supplier.id),
    nextRateSheetVersion(prisma, supplier.id),
    supplierReconciliation(prisma, { supplierId: supplier.id, from, to }),
  ]);

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={`${humanise(supplier.type)}${supplier.country ? ` · ${supplier.country}` : ''}`}
        actions={
          <>
            <LinkButton href={`/suppliers/${supplier.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            <ArchiveSupplierButton supplierId={supplier.id} isActive={supplier.isActive} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Outstanding"
          value={formatMoney(balance.outstanding)}
          hint="Invoiced but unpaid"
          tone={Number.parseFloat(balance.outstanding) > 0 ? 'danger' : 'neutral'}
        />
        <Stat
          label="Not yet invoiced"
          value={formatMoney(balance.notYetInvoiced)}
          hint="Booking cost with no supplier invoice"
        />
        <Stat label="Total cost to date" value={formatMoney(balance.totalCostToDate)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card
            title="Reconciliation"
            description="Bookings with this supplier by travel date."
          >
            <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">From</span>
                <Input type="date" name="from" defaultValue={toInputDate(from)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">To</span>
                <Input type="date" name="to" defaultValue={toInputDate(to)} />
              </label>
              <button
                type="submit"
                className="rounded-md bg-voya-400 px-3.5 py-2 text-sm font-medium text-white hover:bg-voya-500"
              >
                Apply
              </button>
            </form>

            <div className="mb-3 flex flex-wrap gap-3 text-sm text-slate-600">
              <span>
                Total cost:{' '}
                <strong className="tabular-nums">{formatMoney(reconciliation.totalCost)}</strong>
              </span>
              <span>
                Matched to an invoice: <strong>{reconciliation.matchedCount}</strong>
              </span>
              <span className={reconciliation.unmatchedCount > 0 ? 'text-amber-700' : ''}>
                Unmatched: <strong>{reconciliation.unmatchedCount}</strong>
              </span>
            </div>

            {reconciliation.bookings.length === 0 ? (
              <EmptyState
                title="No bookings in this range"
                description="Widen the date range to see more."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Customer</Th>
                    <Th>Travel</Th>
                    <Th className="text-right">Cost (BHD)</Th>
                    <Th>Invoiced</Th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/bookings/${booking.id}`}
                          className="font-medium text-voya-800 hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </Td>
                      <Td className="max-w-[10rem] truncate">{booking.customer.fullName}</Td>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(booking.departureDate)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(booking.costAmountBase.toString(), 'BHD', {
                          withCode: false,
                        })}
                      </Td>
                      <Td>
                        {booking.supplierInvoices.length > 0 ? (
                          <Badge tone="success">Yes</Badge>
                        ) : (
                          <Badge tone="warning">No</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Supplier invoices">
            {supplier.invoices.length === 0 ? (
              <EmptyState title="No supplier invoices recorded" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Issued</Th>
                    <Th>Due</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Paid</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.invoices.map((invoice) => {
                    const outstanding = subtract(invoice.amount, invoice.paidAmount);

                    return (
                      <tr key={invoice.id}>
                        <Td className="font-medium">{invoice.reference}</Td>
                        <Td className="whitespace-nowrap text-slate-600">
                          {formatDate(invoice.issueDate)}
                        </Td>
                        <Td className="whitespace-nowrap text-slate-600">
                          {formatDate(invoice.dueDate)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(invoice.amount.toString(), invoice.currency)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(invoice.paidAmount.toString(), invoice.currency, {
                            withCode: false,
                          })}
                        </Td>
                        <Td>
                          <SupplierInvoiceStatusBadge status={invoice.status} />
                          {invoice.disputeNote ? (
                            <p className="mt-1 text-xs text-amber-700">{invoice.disputeNote}</p>
                          ) : null}
                        </Td>
                        <Td>
                          <SupplierInvoiceActions
                            invoiceId={invoice.id}
                            isDisputed={invoice.status === 'DISPUTED'}
                            outstanding={toStorage(
                              outstanding.isNegative() ? 0 : outstanding,
                              invoice.currency,
                            )}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Terms">
            <DescriptionList
              items={[
                {
                  label: 'Payment terms',
                  value:
                    supplier.paymentTerms === 'CREDIT'
                      ? `Credit · net ${supplier.creditDays ?? '—'}`
                      : 'Prepaid',
                },
                {
                  label: 'Commission',
                  value:
                    supplier.commissionType === 'FIXED_PERCENT'
                      ? `${supplier.commissionValue.toString()}%`
                      : supplier.commissionType === 'FIXED_AMOUNT'
                        ? formatMoney(supplier.commissionValue.toString(), supplier.defaultCurrency)
                        : 'None',
                },
                { label: 'Default currency', value: supplier.defaultCurrency },
                { label: 'Contact', value: supplier.contactName ?? '—' },
                { label: 'Email', value: supplier.contactEmail ?? '—' },
                { label: 'Phone', value: supplier.contactPhone ?? '—' },
              ]}
            />
            {supplier.notes ? (
              <p className="mt-4 border-t border-slate-100 pt-4 text-sm whitespace-pre-wrap text-slate-700">
                {supplier.notes}
              </p>
            ) : null}
          </Card>

          <Card
            title="Rate sheets"
            description="Versioned, so historical bookings keep their applicable rate."
          >
            {supplier.rateSheets.length === 0 ? (
              <p className="text-sm text-slate-500">No rate sheets yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {supplier.rateSheets.map((sheet) => (
                  <li key={sheet.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        v{sheet.version} · {sheet.name}
                      </span>
                      {sheet.effectiveTo === null ? (
                        <Badge tone="success">Current</Badge>
                      ) : (
                        <Badge tone="neutral">Closed</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(sheet.effectiveFrom)} →{' '}
                      {sheet.effectiveTo ? formatDate(sheet.effectiveTo) : 'open'} ·{' '}
                      {sheet.currency}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <RateSheetForm
            supplierId={supplier.id}
            defaultCurrency={supplier.defaultCurrency}
            nextVersion={nextVersion}
          />

          <SupplierInvoiceForm
            supplierId={supplier.id}
            defaultCurrency={supplier.defaultCurrency}
          />
        </div>
      </div>
    </>
  );
}
