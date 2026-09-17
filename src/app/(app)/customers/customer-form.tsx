'use client';

import { useActionState, useState } from 'react';
import type { Customer } from '@prisma/client';
import { Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState, type ActionState } from '@/server/actions/types';
import { toInputDate } from '@/lib/dates';

/**
 * Create/edit form for a customer.
 *
 * Client-side only to toggle the corporate fields — the schema, the validation
 * and the write all live in the server action.
 */
export function CustomerForm({
  action,
  customer,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  customer?: Customer;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const [customerType, setCustomerType] = useState(customer?.customerType ?? 'INDIVIDUAL');
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <FormMessage state={state} />

      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <div className="space-y-6">
        <Card title="Identity">
          <FormGrid>
            <Field
              label="Full name"
              required
              hint="Exactly as it appears in the passport."
              error={errors.fullName}
              className="sm:col-span-2"
            >
              <Input name="fullName" defaultValue={customer?.fullName ?? ''} required />
            </Field>

            <Field label="Customer type" required error={errors.customerType}>
              <Select
                name="customerType"
                value={customerType}
                onChange={(event) =>
                  setCustomerType(event.target.value as 'INDIVIDUAL' | 'CORPORATE')
                }
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="CORPORATE">Corporate</option>
              </Select>
            </Field>

            <Field
              label="Nationality"
              hint="Two-letter country code, for visa lookups."
              error={errors.nationality}
            >
              <Input
                name="nationality"
                defaultValue={customer?.nationality ?? ''}
                maxLength={2}
                placeholder="BH"
                className="uppercase"
              />
            </Field>
          </FormGrid>
        </Card>

        <Card title="Contact" description="WhatsApp is the primary notification channel.">
          <FormGrid>
            <Field label="Phone" required error={errors.phone}>
              <Input name="phone" defaultValue={customer?.phone ?? ''} placeholder="+973 3300 1122" required />
            </Field>

            <Field
              label="WhatsApp number"
              hint="Leave blank to use the phone number above."
              error={errors.whatsappPhone}
            >
              <Input name="whatsappPhone" defaultValue={customer?.whatsappPhone ?? ''} />
            </Field>

            <Field label="Email" error={errors.email} className="sm:col-span-2">
              <Input type="email" name="email" defaultValue={customer?.email ?? ''} />
            </Field>
          </FormGrid>
        </Card>

        <Card
          title="Passport"
          description="Stored on file. Proactive expiry alerts arrive in Phase 2."
        >
          <FormGrid>
            <Field label="Passport number" error={errors.passportNumber}>
              <Input name="passportNumber" defaultValue={customer?.passportNumber ?? ''} />
            </Field>

            <Field label="Passport expiry" error={errors.passportExpiry}>
              <Input
                type="date"
                name="passportExpiry"
                defaultValue={toInputDate(customer?.passportExpiry)}
              />
            </Field>
          </FormGrid>
        </Card>

        {customerType === 'CORPORATE' ? (
          <Card title="Corporate details">
            <FormGrid>
              <Field label="Company name" required error={errors.companyName}>
                <Input name="companyName" defaultValue={customer?.companyName ?? ''} />
              </Field>

              <Field label="CR number" hint="Commercial Registration." error={errors.crNumber}>
                <Input name="crNumber" defaultValue={customer?.crNumber ?? ''} />
              </Field>

              <Field label="Billing contact" error={errors.billingContact}>
                <Input name="billingContact" defaultValue={customer?.billingContact ?? ''} />
              </Field>

              <Field label="Billing email" error={errors.billingEmail}>
                <Input type="email" name="billingEmail" defaultValue={customer?.billingEmail ?? ''} />
              </Field>

              <Field label="Agreed rate" error={errors.agreedRateNote} className="sm:col-span-2">
                <Textarea
                  name="agreedRateNote"
                  defaultValue={customer?.agreedRateNote ?? ''}
                  placeholder="e.g. 8% off published fares, net 30."
                />
              </Field>
            </FormGrid>
          </Card>
        ) : null}

        <Card title="Notes">
          <Field label="Internal notes" error={errors.notes}>
            <Textarea name="notes" defaultValue={customer?.notes ?? ''} />
          </Field>
        </Card>
      </div>

      <FormActions>
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton
          href={customer ? `/customers/${customer.id}` : '/customers'}
          variant="secondary"
        >
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}
