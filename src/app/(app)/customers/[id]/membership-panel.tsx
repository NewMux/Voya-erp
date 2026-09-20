'use client';

import { useActionState } from 'react';
import type { Membership } from '@prisma/client';
import {
  cancelMembershipAction,
  issueMembershipAction,
  renewMembershipAction,
} from '@/server/actions/customer.actions';
import { Card, DescriptionList, Field, Input, Select } from '@/components/ui';
import { ConfirmButton, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { MembershipStatusBadge } from '@/components/status';
import { idleState } from '@/server/actions/types';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

/**
 * Membership panel on the customer page.
 *
 * Issue when there is none, renew or cancel when there is. Only ADMIN and
 * ACCOUNTANT see this at all; the server actions enforce that independently.
 */
export function MembershipPanel({
  customerId,
  membership,
  defaultDiscountPercent,
  canCancel,
}: {
  customerId: string;
  membership: (Membership & { renewals: Array<{ id: string; periodEnd: Date; amount: unknown }> }) | null;
  defaultDiscountPercent: string;
  canCancel: boolean;
}) {
  const [issueState, issueAction] = useActionState(issueMembershipAction, idleState);
  const [renewState, renewAction] = useActionState(renewMembershipAction, idleState);
  const [cancelState, cancelAction] = useActionState(cancelMembershipAction, idleState);

  if (!membership) {
    return (
      <Card
        title="Membership"
        description="Converts this regular customer into a member: issues the next sequential number and applies the discount at booking time."
      >
        <form action={issueAction}>
          <FormMessage state={issueState} />
          <input type="hidden" name="customerId" value={customerId} />

          <FormGrid>
            <Field label="Tier">
              <Select name="tier" defaultValue="VOYAGEUR">
                <option value="VOYAGEUR">Voyageur</option>
                <option value="GOLD">Gold</option>
                <option value="PLATINUM">Platinum</option>
              </Select>
            </Field>

            <Field label="Discount %" hint="Applied automatically to new bookings.">
              <Input
                name="discountPercent"
                defaultValue={defaultDiscountPercent}
                inputMode="decimal"
              />
            </Field>

            <Field label="Start date" hint="Defaults to today.">
              <Input type="date" name="startDate" />
            </Field>

            <Field label="Renews every" hint="How long one subscription period lasts.">
              <div className="flex gap-2">
                <Input
                  name="renewalValue"
                  inputMode="numeric"
                  defaultValue="1"
                  className="w-16"
                />
                <Select name="renewalUnit" defaultValue="YEAR" className="flex-1">
                  <option value="DAY">Day(s)</option>
                  <option value="MONTH">Month(s)</option>
                  <option value="YEAR">Year(s)</option>
                </Select>
              </div>
            </Field>

            <Field
              label="Expiry date"
              hint="Leave blank to use the renewal period above."
              className="sm:col-span-2"
            >
              <Input type="date" name="expiryDate" />
            </Field>
          </FormGrid>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="groupBookingPriority"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300 text-voya-500"
            />
            Priority on Group Adventure waitlists
          </label>

          <div className="mt-4">
            <SubmitButton>Convert to member</SubmitButton>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card
      title="Membership"
      actions={<MembershipStatusBadge status={membership.status} />}
    >
      <DescriptionList
        items={[
          {
            label: 'Number',
            value: (
              <span className="font-mono tabular-nums">{membership.membershipNumber}</span>
            ),
          },
          { label: 'Tier', value: membership.tier },
          { label: 'Started', value: formatDate(membership.startDate) },
          { label: 'Expires', value: formatDate(membership.expiryDate) },
          {
            label: 'Renews every',
            value: `${membership.renewalValue} ${membership.renewalUnit.toLowerCase()}${membership.renewalValue === 1 ? '' : 's'}`,
          },
          { label: 'Discount', value: `${membership.discountPercent.toString()}%` },
          {
            label: 'Group priority',
            value: membership.groupBookingPriority ? 'Yes' : 'No',
          },
        ]}
      />

      {membership.renewals.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Renewal history
          </p>
          <ul className="space-y-1 text-sm text-slate-600">
            {membership.renewals.map((renewal) => (
              <li key={renewal.id} className="flex justify-between gap-4">
                <span>Through {formatDate(renewal.periodEnd)}</span>
                <span className="tabular-nums">{formatMoney(String(renewal.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {membership.status !== 'CANCELLED' ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Renew
          </p>
          <form action={renewAction}>
            <FormMessage state={renewState} />
            <input type="hidden" name="membershipId" value={membership.id} />

            <FormGrid>
              <Field label="Amount (BHD)">
                <Input name="amount" inputMode="decimal" placeholder="0.000" defaultValue="" />
              </Field>

              <Field label="Method">
                <Select name="method" defaultValue="CASH">
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="BENEFIT_PAY">Benefit Pay</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>

              <Field label="Reference">
                <Input name="reference" placeholder="Receipt or transfer reference" />
              </Field>

              <Field label="Renews for">
                <div className="flex gap-2">
                  <Input
                    name="renewalValue"
                    inputMode="numeric"
                    defaultValue={String(membership.renewalValue)}
                    className="w-16"
                  />
                  <Select name="renewalUnit" defaultValue={membership.renewalUnit} className="flex-1">
                    <option value="DAY">Day(s)</option>
                    <option value="MONTH">Month(s)</option>
                    <option value="YEAR">Year(s)</option>
                  </Select>
                </div>
              </Field>
            </FormGrid>

            <div className="mt-4">
              <SubmitButton>Renew membership</SubmitButton>
            </div>
          </form>

          {canCancel ? (
            <form action={cancelAction} className="mt-4 border-t border-slate-100 pt-4">
              <FormMessage state={cancelState} />
              <input type="hidden" name="membershipId" value={membership.id} />
              <ConfirmButton
                variant="danger"
                size="sm"
                confirmText="Cancel this membership? The number and history are kept."
              >
                Cancel membership
              </ConfirmButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
