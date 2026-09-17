import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireUser } from '@/server/guards';
import { searchCustomers } from '@/server/services/customer.service';
import { formatDate } from '@/lib/dates';
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

export const metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q = '' } = await searchParams;
  const customers = await searchCustomers(q);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Search by membership number, name, phone, email or passport."
        actions={<LinkButton href="/customers/new">New customer</LinkButton>}
      />

      <Card>
        <form className="mb-4 flex gap-2" method="get">
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
          <LinkButton href="/customers" variant="ghost" className={q ? '' : 'hidden'}>
            Clear
          </LinkButton>
        </form>

        {customers.length === 0 ? (
          <EmptyState
            title={q ? 'No customers matched' : 'No customers yet'}
            description={
              q
                ? 'Try a membership number, a partial name, or the last digits of a phone number.'
                : 'Add your first customer to start taking bookings.'
            }
            action={<LinkButton href="/customers/new">New customer</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Membership</Th>
                <Th>Phone</Th>
                <Th>Type</Th>
                <Th>Passport expiry</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
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
                  <Td>
                    {customer.membership ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs tabular-nums">
                          {customer.membership.membershipNumber}
                        </span>
                        <MembershipStatusBadge status={customer.membership.status} />
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{customer.phone}</Td>
                  <Td>
                    <Badge tone={customer.customerType === 'CORPORATE' ? 'info' : 'neutral'}>
                      {customer.customerType === 'CORPORATE' ? 'Corporate' : 'Individual'}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">
                    {formatDate(customer.passportExpiry)}
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
