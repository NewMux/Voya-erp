'use client';

import { useActionState } from 'react';
import type { VisaCountryReference } from '@prisma/client';
import { Card, CountryField, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState, type ActionState } from '@/server/actions/types';
import { CURRENCY_VALUES } from '@/lib/validation';

export function VisaCountryForm({
  action,
  reference,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  reference?: VisaCountryReference;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      {reference ? <input type="hidden" name="id" value={reference.id} /> : null}

      <Card title="Visa country">
        <FormGrid>
          <Field label="Country" required error={errors.country} className="sm:col-span-2">
            <CountryField name="country" defaultValue={reference?.country ?? ''} required />
          </Field>

          <Field label="Issuing embassy / consulate" error={errors.embassyName}>
            <Input name="embassyName" defaultValue={reference?.embassyName ?? ''} />
          </Field>

          <Field label="Processing time (days)" error={errors.processingTimeDays}>
            <Input
              name="processingTimeDays"
              inputMode="numeric"
              defaultValue={reference?.processingTimeDays?.toString() ?? ''}
            />
          </Field>

          <Field label="Visa fee" required error={errors.visaFeeAmount}>
            <Input
              name="visaFeeAmount"
              inputMode="decimal"
              defaultValue={reference?.visaFeeAmount.toString() ?? '0'}
            />
          </Field>

          <Field label="Fee currency" error={errors.visaFeeCurrency}>
            <Select name="visaFeeCurrency" defaultValue={reference?.visaFeeCurrency ?? 'BHD'}>
              {CURRENCY_VALUES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Required documents"
            error={errors.requiredDocuments}
            className="sm:col-span-2"
          >
            <Textarea
              name="requiredDocuments"
              defaultValue={reference?.requiredDocuments ?? ''}
              placeholder="Passport valid 6 months, 2 photos, bank statement…"
            />
          </Field>

          <Field
            label="Terms & conditions"
            error={errors.termsAndConditions}
            className="sm:col-span-2"
          >
            <Textarea name="termsAndConditions" defaultValue={reference?.termsAndConditions ?? ''} />
          </Field>
        </FormGrid>
      </Card>

      <FormActions>
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton href="/settings/visa-countries" variant="secondary">
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}
