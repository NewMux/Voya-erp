'use client';

import { useActionState } from 'react';
import type { PartnerOffer } from '@prisma/client';
import { Card, CountryField, Field, Input, LinkButton, Textarea } from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState, type ActionState } from '@/server/actions/types';
import { toInputDate } from '@/lib/dates';

export function PartnerOfferForm({
  action,
  offer,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  offer?: PartnerOffer;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      {offer ? <input type="hidden" name="id" value={offer.id} /> : null}

      <Card title="Partner">
        <FormGrid>
          <Field label="Partner name" required error={errors.name} className="sm:col-span-2">
            <Input name="name" defaultValue={offer?.name ?? ''} required />
          </Field>

          <Field label="Country" error={errors.country}>
            <CountryField name="country" defaultValue={offer?.country ?? ''} />
          </Field>

          <Field label="Logo" hint={offer?.logoFileKey ? 'Replaces the current logo.' : undefined}>
            <input
              type="file"
              name="logo"
              accept="image/*"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-voya-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-voya-800 hover:file:bg-voya-200"
            />
            {offer?.logoFileKey ? (
              <a
                href={`/api/files/${offer.logoFileKey}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-xs text-voya-700 underline"
              >
                View current logo
              </a>
            ) : null}
          </Field>

          <Field
            label="Description / offer"
            required
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              name="description"
              defaultValue={offer?.description ?? ''}
              placeholder="20% off spa treatments for Voya members"
            />
          </Field>

          <Field
            label="Terms & conditions"
            error={errors.termsAndConditions}
            className="sm:col-span-2"
          >
            <Textarea name="termsAndConditions" defaultValue={offer?.termsAndConditions ?? ''} />
          </Field>

          <Field label="Agreement start" required error={errors.agreementStart}>
            <Input
              type="date"
              name="agreementStart"
              defaultValue={toInputDate(offer?.agreementStart)}
              required
            />
          </Field>

          <Field label="Agreement end" required error={errors.agreementEnd}>
            <Input
              type="date"
              name="agreementEnd"
              defaultValue={toInputDate(offer?.agreementEnd)}
              required
            />
          </Field>

          <Field
            label="Signed agreement (PDF)"
            className="sm:col-span-2"
            hint={offer?.agreementDocumentFileKey ? 'Replaces the current file.' : undefined}
          >
            <input
              type="file"
              name="agreementDocument"
              accept="application/pdf"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-voya-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-voya-800 hover:file:bg-voya-200"
            />
            {offer?.agreementDocumentFileKey ? (
              <a
                href={`/api/files/${offer.agreementDocumentFileKey}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-xs text-voya-700 underline"
              >
                View current agreement
              </a>
            ) : null}
          </Field>
        </FormGrid>
      </Card>

      <FormActions>
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton href="/settings/partner-offers" variant="secondary">
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}
