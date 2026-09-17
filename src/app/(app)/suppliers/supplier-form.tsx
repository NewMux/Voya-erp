'use client';

import { useActionState, useState } from 'react';
import type { Supplier } from '@prisma/client';
import { Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState, type ActionState } from '@/server/actions/types';
import { CURRENCY_VALUES } from '@/lib/validation';

export function SupplierForm({
  action,
  supplier,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  supplier?: Supplier;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const [paymentTerms, setPaymentTerms] = useState(supplier?.paymentTerms ?? 'PREPAID');
  const [commissionType, setCommissionType] = useState(supplier?.commissionType ?? 'NONE');
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}

      <div className="space-y-6">
        <Card title="Supplier">
          <FormGrid>
            <Field label="Name" required error={errors.name}>
              <Input name="name" defaultValue={supplier?.name ?? ''} required />
            </Field>

            <Field label="Type" required error={errors.type}>
              <Select name="type" defaultValue={supplier?.type ?? 'AIRLINE'}>
                <option value="AIRLINE">Airline</option>
                <option value="HOTEL">Hotel</option>
                <option value="DMC">DMC</option>
                <option value="TRANSPORT">Transport</option>
                <option value="VISA_AGENT">Visa handling agent</option>
              </Select>
            </Field>

            <Field label="Contact name" error={errors.contactName}>
              <Input name="contactName" defaultValue={supplier?.contactName ?? ''} />
            </Field>

            <Field label="Country" error={errors.country}>
              <Input
                name="country"
                defaultValue={supplier?.country ?? ''}
                maxLength={2}
                placeholder="BH"
                className="uppercase"
              />
            </Field>

            <Field label="Contact email" error={errors.contactEmail}>
              <Input type="email" name="contactEmail" defaultValue={supplier?.contactEmail ?? ''} />
            </Field>

            <Field label="Contact phone" error={errors.contactPhone}>
              <Input name="contactPhone" defaultValue={supplier?.contactPhone ?? ''} />
            </Field>
          </FormGrid>
        </Card>

        <Card title="Commercial terms">
          <FormGrid>
            <Field label="Payment terms" required error={errors.paymentTerms}>
              <Select
                name="paymentTerms"
                value={paymentTerms}
                onChange={(event) => setPaymentTerms(event.target.value as 'PREPAID' | 'CREDIT')}
              >
                <option value="PREPAID">Prepaid</option>
                <option value="CREDIT">Credit</option>
              </Select>
            </Field>

            {paymentTerms === 'CREDIT' ? (
              <Field
                label="Credit period (days)"
                required
                hint="e.g. 15, 30, 45."
                error={errors.creditDays}
              >
                <Input
                  name="creditDays"
                  inputMode="numeric"
                  defaultValue={supplier?.creditDays?.toString() ?? '30'}
                />
              </Field>
            ) : (
              <input type="hidden" name="creditDays" value="" />
            )}

            <Field label="Commission structure" error={errors.commissionType}>
              <Select
                name="commissionType"
                value={commissionType}
                onChange={(event) =>
                  setCommissionType(
                    event.target.value as 'NONE' | 'FIXED_PERCENT' | 'FIXED_AMOUNT',
                  )
                }
              >
                <option value="NONE">None</option>
                <option value="FIXED_PERCENT">Fixed percentage</option>
                <option value="FIXED_AMOUNT">Fixed amount</option>
              </Select>
            </Field>

            {commissionType === 'NONE' ? (
              <input type="hidden" name="commissionValue" value="0" />
            ) : (
              <Field
                label={commissionType === 'FIXED_PERCENT' ? 'Commission %' : 'Commission amount'}
                error={errors.commissionValue}
              >
                <Input
                  name="commissionValue"
                  inputMode="decimal"
                  defaultValue={supplier?.commissionValue?.toString() ?? '0'}
                />
              </Field>
            )}

            <Field
              label="Default currency"
              hint="Used to pre-fill supplier costs on new bookings."
              error={errors.defaultCurrency}
            >
              <Select name="defaultCurrency" defaultValue={supplier?.defaultCurrency ?? 'BHD'}>
                {CURRENCY_VALUES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </Card>

        <Card title="Notes">
          <Field label="Internal notes" error={errors.notes}>
            <Textarea name="notes" defaultValue={supplier?.notes ?? ''} />
          </Field>
        </Card>
      </div>

      <FormActions>
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton
          href={supplier ? `/suppliers/${supplier.id}` : '/suppliers'}
          variant="secondary"
        >
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}
