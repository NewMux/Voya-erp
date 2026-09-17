import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/dates';
import { formatMoney, subtract, toStorage } from '@/lib/money';
import {
  Card,
  DescriptionList,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { InvoiceStatusBadge, humanise } from '@/components/status';
import { InvoiceActions, InvoicePaymentForm, VoidPaymentButton } from './panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { number: true } });
  return { title: invoice?.number ?? 'Invoice' };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireRole('ADMIN', 'ACCOUNTANT'), params]);

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: { include: { membership: { select: { membershipNumber: true } } } },
      createdBy: { select: { name: true } },
      lines: { orderBy: { sortOrder: 'asc' }, include: { booking: true } },
      payments: { orderBy: { paidAt: 'desc' }, include: { recordedBy: { select: { name: true } } } },
    },
  });
  if (!invoice) notFound();

  const balance = toStorage(subtract(invoice.total, invoice.paidAmount));
  const settled = invoice.status === 'PAID' || invoice.status === 'CANCELLED';

  return (
    <>
      <PageHeader
        title={invoice.number}
        description={`Issued ${formatDate(invoice.issueDate)} by ${invoice.createdBy?.name ?? 'system'}`}
        actions={
          <>
            <InvoiceStatusBadge status={invoice.status} />
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-voya-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              PDF
            </a>
            <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total" value={formatMoney(invoice.total.toString())} />
        <Stat label="Paid" value={formatMoney(invoice.paidAmount.toString())} />
        <Stat
          label="Balance"
          value={formatMoney(balance)}
          tone={Number.parseFloat(balance) > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Lines">
            <Table>
              <thead>
                <tr>
                  <Th>Description</Th>
                  <Th>Booking</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <Td>
                      {line.description}
                      {line.descriptionAr ? (
                        <p className="text-xs text-slate-500" dir="rtl">
                          {line.descriptionAr}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      {line.booking ? (
                        <Link
                          href={`/bookings/${line.booking.id}`}
                          className="text-voya-800 hover:underline"
                        >
                          {line.booking.reference}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{line.quantity.toString()}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(line.unitPrice.toString(), 'BHD', { withCode: false })}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(line.lineTotal.toString(), 'BHD', { withCode: false })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <dl className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatMoney(invoice.subtotal.toString(), 'BHD', { withCode: false })}
                </dd>
              </div>
              {Number.parseFloat(invoice.discountTotal.toString()) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-600">Discount</dt>
                  <dd className="tabular-nums">
                    −{formatMoney(invoice.discountTotal.toString(), 'BHD', { withCode: false })}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(invoice.total.toString())}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Payments">
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing received against this invoice yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th>Reference</Th>
                    <Th>Recorded by</Th>
                    <Th className="text-right">Amount</Th>
                    {user.role === 'ADMIN' ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id}>
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(payment.paidAt)}
                      </Td>
                      <Td>{humanise(payment.method)}</Td>
                      <Td className="text-slate-600">{payment.reference ?? '—'}</Td>
                      <Td className="text-slate-600">{payment.recordedBy?.name ?? '—'}</Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(payment.amount.toString(), 'BHD', { withCode: false })}
                      </Td>
                      {user.role === 'ADMIN' ? (
                        <Td>
                          <VoidPaymentButton paymentId={payment.id} />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <DescriptionList
              items={[
                {
                  label: 'Customer',
                  value: (
                    <Link
                      href={`/customers/${invoice.customer.id}`}
                      className="text-voya-800 hover:underline"
                    >
                      {invoice.customer.fullName}
                    </Link>
                  ),
                },
                {
                  label: 'Membership',
                  value: invoice.customer.membership?.membershipNumber ?? '—',
                },
                { label: 'Issued', value: formatDate(invoice.issueDate) },
                { label: 'Due', value: formatDate(invoice.dueDate) },
                { label: 'Template', value: humanise(invoice.language) },
                { label: 'Sent', value: formatDate(invoice.sentAt) },
              ]}
            />
          </Card>

          <Card title="Preview the PDF">
            <div className="flex flex-wrap gap-2">
              {(['en', 'ar', 'bilingual'] as const).map((lang) => (
                <a
                  key={lang}
                  href={`/api/invoices/${invoice.id}/pdf?lang=${lang}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-voya-800 hover:bg-slate-50"
                >
                  {lang === 'en' ? 'English' : lang === 'ar' ? 'Arabic' : 'Bilingual'}
                </a>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Previewing another language does not change the invoice.
            </p>
          </Card>

          {!settled ? (
            <InvoicePaymentForm
              invoiceId={invoice.id}
              customerId={invoice.customerId}
              balance={balance}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
