import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireUser } from '@/server/guards';
import { searchCustomers } from '@/server/services/customer.service';
import { formatDate, daysBetween, today } from '@/lib/dates';
import {
  Badge,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { MembershipStatusBadge } from '@/components/status';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

const TABS = [
  { value: 'regular', label: 'Regular customers' },
  { value: 'members', label: 'Subscribers / Members' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/**
 * Customers and Membership merged into one page (a client change request):
 * the same list, split into Regular Customers and Subscribers/Members tabs
 * instead of two separate pages. "Member" here means an ACTIVE membership —
 * once the renewal-reminder cron flips a lapsed one to EXPIRED, that customer
 * falls out of the Members tab into Regular automatically, no manual step.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  await requireUser();
  const { q = '', tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === 'members' ? 'members' : 'regular';

  // Bounded but generous — tab filtering happens in memory below, so a
  // search needs enough rows fetched to still find matches in both tabs.
  const customers = await searchCustomers(q, { limit: q.trim() ? 100 : 300 });
  const members = customers.filter((c) => c.membership?.status === 'ACTIVE');
  const regular = customers.filter((c) => c.membership?.status !== 'ACTIVE');
  const visible = tab === 'members' ? members : regular;

  const now = today();

  return (
    <>
      <PageHeader
        title="Customers"
        description="Search by membership number, name, phone, email or passport."
        actions={<LinkButton href="/customers/new">New customer</LinkButton>}
      />

      <Card>
        <form className="mb-4 flex gap-2" method="get">
          <input type="hidden" name="tab" value={tab} />
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder="VY-0001042, name, +973…"
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
          <LinkButton href={`/customers?tab=${tab}`} variant="ghost" className={q ? '' : 'hidden'}>
            Clear
          </LinkButton>
        </form>

        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/customers?tab=${t.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                tab === t.value
                  ? 'border-voya-500 text-voya-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-slate-400">
                ({t.value === 'members' ? members.length : regular.length})
              </span>
            </Link>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={
              q
                ? 'No customers matched'
                : tab === 'members'
                  ? 'No members yet'
                  : 'No regular customers yet'
            }
            description={
              q
                ? 'Try a membership number, a partial name, or the last digits of a phone number.'
                : tab === 'members'
                  ? 'Convert a regular customer to a member from their profile.'
                  : 'Add your first customer to start taking bookings.'
            }
            action={<LinkButton href="/customers/new">New customer</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                {tab === 'members' ? <Th>Membership</Th> : null}
                <Th>Phone</Th>
                <Th>Type</Th>
                {tab === 'members' ? <Th>Expires</Th> : <Th>Passport expiry</Th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((customer) => {
                const daysLeft = customer.membership
                  ? daysBetween(now, customer.membership.expiryDate)
                  : null;
                const expiringSoon =
                  customer.membership?.status === 'ACTIVE' &&
                  daysLeft !== null &&
                  daysLeft >= 0 &&
                  daysLeft <= 30;

                return (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-medium text-voya-800 hover:underline"
                      >
                        {customer.fullName}
                      </Link>
                      {customer.companyName ? (
                        <p className="text-xs text-slate-500">{customer.companyName}</p>
                      ) : null}
                    </Td>
                    {tab === 'members' ? (
                      <Td>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs tabular-nums">
                            {customer.membership?.membershipNumber}
                          </span>
                          <Badge tone="gold">{customer.membership?.tier}</Badge>
                        </span>
                      </Td>
                    ) : null}
                    <Td className="whitespace-nowrap tabular-nums">{customer.phone}</Td>
                    <Td>
                      <Badge tone={customer.customerType === 'CORPORATE' ? 'info' : 'neutral'}>
                        {customer.customerType === 'CORPORATE' ? 'Corporate' : 'Individual'}
                      </Badge>
                    </Td>
                    {tab === 'members' ? (
                      <Td className="whitespace-nowrap">
                        <span className={expiringSoon ? 'font-medium text-amber-700' : ''}>
                          {formatDate(customer.membership?.expiryDate)}
                        </span>
                        {expiringSoon ? (
                          <p className="text-xs text-amber-600">
                            {daysLeft === 0 ? 'Expires today' : `${daysLeft} days left`}
                          </p>
                        ) : null}
                      </Td>
                    ) : (
                      <Td className="whitespace-nowrap text-slate-600">
                        {formatDate(customer.passportExpiry)}
                        {customer.membership ? (
                          <span className="ml-2">
                            <MembershipStatusBadge status={customer.membership.status} />
                          </span>
                        ) : null}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
