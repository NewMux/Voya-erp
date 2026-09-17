import Link from 'next/link';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { outstandingScheduleItems } from '@/server/services/payment.service';
import { daysBetween, formatDate, today } from '@/lib/dates';
import { add, formatMoney, subtract, toStorage } from '@/lib/money';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { humanise, ScheduleStatusBadge } from '@/components/status';

export const metadata = { title: 'Payments' };
export const dynamic = 'force-dynamic';

/**
 * Outstanding balances and recent receipts — PRD section 4.3.
 *
 * The outstanding list is sorted by due date, which is the order staff chase in.
 */
export default async function PaymentsPage() {
  await requireRole('ADMIN', 'ACCOUNTANT');

  const [items, payments, refunds] = await Promise.all([
    outstandingScheduleItems(prisma),
    prisma.payment.findMany({
      orderBy: { paidAt: 'desc' },
      take: 40,
      include: {
        customer: { select: { id: true, fullName: true } },
        invoice: { select: { id: true, number: true } },
        allocations: { include: { booking: { select: { id: true, reference: true } } } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.refund.findMany({
      where: { status: { in: ['PENDING', 'PROCESSED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        booking: {
          select: { id: true, reference: true, customer: { select: { fullName: true } } },
        },
      },
    }),
  ]);

  const now = today();
  const outstandingTotal = items.reduce(
    (total, item) => add(total, subtract(item.amountDue, item.paidAmount)),
    add(0),
  );
  const overdue = items.filter((item) => item.dueDate.getTime() < now.getTime());
  const overdueTotal = overdue.reduce(
    (total, item) => add(total, subtract(item.amountDue, item.paidAmount)),
    add(0),
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="Everything unpaid, sorted by due date, plus recent receipts and refunds."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Outstanding"
          value={formatMoney(toStorage(outstandingTotal))}
          hint={`${items.length} instalment${items.length === 1 ? '' : 's'}`}
        />
        <Stat
          label="Overdue"
          value={formatMoney(toStorage(overdueTotal))}
          hint={`${overdue.length} past due`}
          tone={overdue.length > 0 ? 'danger' : 'neutral'}
        />
        <Stat label="Pending refunds" value={String(refunds.filter((r) => r.status === 'PENDING').length)} />
      </div>

      <div className="space-y-6">
        <Card title="Outstanding balances" description="Oldest due date first.">
          {items.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="Every instalment is settled." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Due</Th>
                  <Th>Customer</Th>
                  <Th>Booking</Th>
                  <Th>Instalment</Th>
                  <Th className="text-right">Outstanding</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const daysLate = daysBetween(item.dueDate, now);
                  const outstanding = subtract(item.amountDue, item.paidAmount);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap">
                        <span className={daysLate > 0 ? 'font-medium text-red-700' : ''}>
                          {formatDate(item.dueDate)}
                        </span>
                        {daysLate > 0 ? (
                          <p className="text-xs text-red-600">{daysLate} days late</p>
                        ) : null}
                      </Td>
                      <Td className="max-w-[12rem] truncate">
                        <Link
                          href={`/customers/${item.booking.customer.id}`}
                          className="hover:underline"
                        >
                          {item.booking.customer.fullName}
                        </Link>
                        <p className="text-xs text-slate-500">{item.booking.customer.phone}</p>
                      </Td>
                      <Td>
                        <Link
                          href={`/bookings/${item.booking.id}`}
                          className="font-medium text-voya-800 hover:underline"
                        >
                          {item.booking.reference}
                        </Link>
                      </Td>
                      <Td>{humanise(item.kind)}</Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(toStorage(outstanding), 'BHD', { withCode: false })}
                      </Td>
                      <Td>
                        <ScheduleStatusBadge status={item.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Recent payments">
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th>Applied to</Th>
                  <Th>Method</Th>
                  <Th>Recorded by</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-slate-600">
                      {formatDate(payment.paidAt)}
                    </Td>
                    <Td className="max-w-[12rem] truncate">
                      <Link
                        href={`/customers/${payment.customer.id}`}
                        className="hover:underline"
                      >
                        {payment.customer.fullName}
                      </Link>
                    </Td>
                    <Td className="space-x-1">
                      {payment.invoice ? (
                        <Link
                          href={`/invoices/${payment.invoice.id}`}
                          className="text-voya-800 hover:underline"
                        >
                          {payment.invoice.number}
                        </Link>
                      ) : null}
                      {payment.allocations.map((allocation) => (
                        <Link
                          key={allocation.id}
                          href={`/bookings/${allocation.booking.id}`}
                          className="text-voya-800 hover:underline"
                        >
                          {allocation.booking.reference}
                        </Link>
                      ))}
                      {!payment.invoice && payment.allocations.length === 0 ? (
                        <span className="text-slate-400">Unallocated</span>
                      ) : null}
                    </Td>
                    <Td>{humanise(payment.method)}</Td>
                    <Td className="text-slate-600">{payment.recordedBy?.name ?? '—'}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(payment.amount.toString(), 'BHD', { withCode: false })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {refunds.length > 0 ? (
          <Card title="Refunds" description="Only processed refunds reduce what a customer has paid.">
            <Table>
              <thead>
                <tr>
                  <Th>Raised</Th>
                  <Th>Customer</Th>
                  <Th>Booking</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id}>
                    <Td className="whitespace-nowrap text-slate-600">
                      {formatDate(refund.createdAt)}
                    </Td>
                    <Td className="max-w-[10rem] truncate">
                      {refund.booking.customer.fullName}
                    </Td>
                    <Td>
                      <Link
                        href={`/bookings/${refund.booking.id}`}
                        className="text-voya-800 hover:underline"
                      >
                        {refund.booking.reference}
                      </Link>
                    </Td>
                    <Td className="max-w-[14rem] truncate text-slate-600">
                      {refund.reason ?? '—'}
                    </Td>
                    <Td>
                      <Badge tone={refund.status === 'PROCESSED' ? 'success' : 'warning'}>
                        {humanise(refund.status)}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(refund.amount.toString(), 'BHD', { withCode: false })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
