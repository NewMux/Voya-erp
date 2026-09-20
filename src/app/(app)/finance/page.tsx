import Link from 'next/link';
import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { outstandingScheduleItems } from '@/server/services/payment.service';
import { daysBetween, formatDate, today } from '@/lib/dates';
import { add, formatMoney, isPositive, subtract, toDecimal, toStorage } from '@/lib/money';
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

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-voya-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

export const metadata = { title: 'Finance' };
export const dynamic = 'force-dynamic';

const BOOKING_TYPE_LABEL: Record<string, string> = {
  FLIGHT: 'Flight',
  HOTEL: 'Hotel',
  PACKAGE: 'Package',
  VISA: 'Visa',
  TRANSPORT: 'Transport',
  GROUP_ADVENTURE: 'Group Adventure',
};

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

/**
 * Finance — formerly "Payments" (change request #14). Restructured into a P&L
 * overview (revenue, cost and margin from confirmed business) and the
 * existing upcoming-payments tracking (outstanding balances, recent
 * receipts, refunds), which is unchanged in substance.
 *
 * Cost and margin are real numbers here, unlike anywhere customer-facing —
 * this page is ADMIN/ACCOUNTANT only, same gate as the old Payments page.
 */
export default async function FinancePage() {
  await requireRole('ADMIN', 'ACCOUNTANT');

  const now = today();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [items, payments, refunds, typeTotals, recentBookings] = await Promise.all([
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
    prisma.booking.groupBy({
      by: ['type'],
      where: { status: { in: ['CONFIRMED', 'TICKETED', 'COMPLETED'] } },
      _sum: { netSellingAmount: true, costAmountBase: true, marginAmount: true },
      _count: true,
    }),
    prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'TICKETED', 'COMPLETED'] },
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true, netSellingAmount: true, costAmountBase: true, marginAmount: true },
    }),
  ]);

  // --- P&L ---
  const plTotal = typeTotals.reduce(
    (acc, row) => ({
      revenue: add(acc.revenue, row._sum.netSellingAmount ?? 0),
      cost: add(acc.cost, row._sum.costAmountBase ?? 0),
      margin: add(acc.margin, row._sum.marginAmount ?? 0),
      count: acc.count + row._count,
    }),
    { revenue: add(0), cost: add(0), margin: add(0), count: 0 },
  );
  const marginPercent = isPositive(plTotal.revenue)
    ? plTotal.margin.dividedBy(plTotal.revenue).times(100).toFixed(1)
    : '0.0';

  const typeRows = typeTotals
    .map((row) => ({
      type: row.type,
      count: row._count,
      revenue: toDecimal(row._sum.netSellingAmount ?? 0),
      cost: toDecimal(row._sum.costAmountBase ?? 0),
      margin: toDecimal(row._sum.marginAmount ?? 0),
    }))
    .sort((a, b) => b.revenue.comparedTo(a.revenue));

  // Bucketed in JS rather than a raw SQL date_trunc — six months of bookings
  // is a small enough set for an internal ERP, and this keeps the query
  // portable.
  const monthBuckets = new Map<
    string,
    {
      date: Date;
      revenue: ReturnType<typeof toDecimal>;
      cost: ReturnType<typeof toDecimal>;
      margin: ReturnType<typeof toDecimal>;
      count: number;
    }
  >();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    monthBuckets.set(`${d.getFullYear()}-${d.getMonth()}`, {
      date: d,
      revenue: toDecimal(0),
      cost: toDecimal(0),
      margin: toDecimal(0),
      count: 0,
    });
  }
  for (const booking of recentBookings) {
    const key = `${booking.createdAt.getFullYear()}-${booking.createdAt.getMonth()}`;
    const bucket = monthBuckets.get(key);
    if (!bucket) continue;
    bucket.revenue = add(bucket.revenue, booking.netSellingAmount);
    bucket.cost = add(bucket.cost, booking.costAmountBase);
    bucket.margin = add(bucket.margin, booking.marginAmount);
    bucket.count += 1;
  }
  const monthRows = [...monthBuckets.values()].map(({ date, ...bucket }) => ({
    label: MONTH_LABEL.format(date),
    ...bucket,
  }));

  // --- Upcoming payments (unchanged from the former Payments page) ---
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
        title="Finance"
        description="Profit & loss from confirmed business, plus everything unpaid, recent receipts and refunds."
      />

      <SectionHeading
        title="Profit & loss"
        description="Confirmed, ticketed and completed bookings — inquiries and cancellations excluded."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(toStorage(plTotal.revenue))} hint={`${plTotal.count} bookings`} />
        <Stat label="Cost" value={formatMoney(toStorage(plTotal.cost))} />
        <Stat label="Margin" value={formatMoney(toStorage(plTotal.margin))} />
        <Stat label="Margin %" value={`${marginPercent}%`} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="By booking type">
          {typeRows.length === 0 ? (
            <EmptyState title="No confirmed business yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th className="text-right">Bookings</Th>
                  <Th className="text-right">Revenue</Th>
                  <Th className="text-right">Margin</Th>
                </tr>
              </thead>
              <tbody>
                {typeRows.map((row) => (
                  <tr key={row.type}>
                    <Td>{BOOKING_TYPE_LABEL[row.type] ?? row.type}</Td>
                    <Td className="text-right tabular-nums">{row.count}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(toStorage(row.revenue), 'BHD', { withCode: false })}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(toStorage(row.margin), 'BHD', { withCode: false })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Last 6 months">
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Bookings</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((row) => (
                <tr key={row.label}>
                  <Td>{row.label}</Td>
                  <Td className="text-right tabular-nums">{row.count}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(toStorage(row.revenue), 'BHD', { withCode: false })}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(toStorage(row.margin), 'BHD', { withCode: false })}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <SectionHeading
        title="Upcoming payments"
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
