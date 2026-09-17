import Link from 'next/link';
import { requireUser } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { addDays, daysBetween, formatDate, today } from '@/lib/dates';
import { Badge, Card, EmptyState, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { MembershipStatusBadge } from '@/components/status';

export const metadata = { title: 'Memberships' };
export const dynamic = 'force-dynamic';

export default async function MembershipsPage() {
  await requireUser();

  const now = today();
  const soon = addDays(now, 30);

  const [memberships, activeCount, expiringCount] = await Promise.all([
    prisma.membership.findMany({
      orderBy: [{ status: 'asc' }, { expiryDate: 'asc' }],
      include: { customer: { select: { id: true, fullName: true, phone: true } } },
      take: 200,
    }),
    prisma.membership.count({ where: { status: 'ACTIVE' } }),
    prisma.membership.count({
      where: { status: 'ACTIVE', expiryDate: { gte: now, lte: soon } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Memberships"
        description="Numbers, subscription periods and benefits. Card printing is handled outside this system."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Active members" value={String(activeCount)} />
        <Stat
          label="Expiring in 30 days"
          value={String(expiringCount)}
          hint="Renewal reminders are queued automatically"
          tone={expiringCount > 0 ? 'danger' : 'neutral'}
        />
        <Stat label="Total issued" value={String(memberships.length)} />
      </div>

      <Card>
        {memberships.length === 0 ? (
          <EmptyState
            title="No memberships issued"
            description="Issue a membership from a customer's page."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Member</Th>
                <Th>Tier</Th>
                <Th>Discount</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => {
                const daysLeft = daysBetween(now, membership.expiryDate);
                const expiringSoon =
                  membership.status === 'ACTIVE' && daysLeft >= 0 && daysLeft <= 30;

                return (
                  <tr key={membership.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs tabular-nums">
                      {membership.membershipNumber}
                    </Td>
                    <Td>
                      <Link
                        href={`/customers/${membership.customer.id}`}
                        className="font-medium text-voya-800 hover:underline"
                      >
                        {membership.customer.fullName}
                      </Link>
                      <p className="text-xs text-slate-500">{membership.customer.phone}</p>
                    </Td>
                    <Td>
                      <Badge tone="gold">{membership.tier}</Badge>
                    </Td>
                    <Td className="tabular-nums">{membership.discountPercent.toString()}%</Td>
                    <Td className="whitespace-nowrap">
                      <span className={expiringSoon ? 'font-medium text-amber-700' : ''}>
                        {formatDate(membership.expiryDate)}
                      </span>
                      {expiringSoon ? (
                        <p className="text-xs text-amber-600">
                          {daysLeft === 0 ? 'Expires today' : `${daysLeft} days left`}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <MembershipStatusBadge status={membership.status} />
                    </Td>
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
