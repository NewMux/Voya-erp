'use client';

import { useActionState } from 'react';
import { updateSettings } from '@/server/actions/settings.actions';
import { Card, Field, Input, Textarea } from '@/components/ui';
import { FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [state, action] = useActionState(updateSettings, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action}>
      <FormMessage state={state} />

      <div className="space-y-6">
        <Card
          title="Company details"
          description="Used on the invoice PDF header and footer."
        >
          <FormGrid>
            <Field label="Company name" required error={errors['company.name']}>
              <Input name="company.name" defaultValue={settings['company.name'] ?? ''} required />
            </Field>
            <Field label="Company name (Arabic)" error={errors['company.nameAr']}>
              <Input
                name="company.nameAr"
                dir="rtl"
                defaultValue={settings['company.nameAr'] ?? ''}
              />
            </Field>
            <Field label="Address" error={errors['company.address']} className="sm:col-span-2">
              <Input name="company.address" defaultValue={settings['company.address'] ?? ''} />
            </Field>
            <Field
              label="Address (Arabic)"
              error={errors['company.addressAr']}
              className="sm:col-span-2"
            >
              <Input
                name="company.addressAr"
                dir="rtl"
                defaultValue={settings['company.addressAr'] ?? ''}
              />
            </Field>
            <Field label="Phone" error={errors['company.phone']}>
              <Input name="company.phone" defaultValue={settings['company.phone'] ?? ''} />
            </Field>
            <Field label="Email" error={errors['company.email']}>
              <Input name="company.email" defaultValue={settings['company.email'] ?? ''} />
            </Field>
            <Field label="Instagram" error={errors['company.instagram']}>
              <Input
                name="company.instagram"
                defaultValue={settings['company.instagram'] ?? ''}
              />
            </Field>
          </FormGrid>
        </Card>

        <Card
          title="Invoice terms"
          description="Shown on an invoice PDF when the invoice does not set its own terms."
        >
          <FormGrid>
            <Field label="Terms (English)" error={errors['invoice.terms']}>
              <Textarea name="invoice.terms" defaultValue={settings['invoice.terms'] ?? ''} />
            </Field>
            <Field label="Terms (Arabic)" error={errors['invoice.termsAr']}>
              <Textarea
                name="invoice.termsAr"
                dir="rtl"
                defaultValue={settings['invoice.termsAr'] ?? ''}
              />
            </Field>
          </FormGrid>
        </Card>

        <Card
          title="Membership"
          description="Pre-fills the discount field when issuing a new membership."
        >
          <Field label="Member's own discount %" error={errors['membership.defaultDiscountPercent']}>
            <Input
              name="membership.defaultDiscountPercent"
              inputMode="decimal"
              defaultValue={settings['membership.defaultDiscountPercent'] ?? '10'}
            />
          </Field>
        </Card>

        <Card
          title="Family discount"
          description="A separate rate for a member's family, on Voya's own bookings only — never on partner offers."
        >
          <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="membership.familyDiscountEnabled"
              defaultChecked={settings['membership.familyDiscountEnabled'] === 'true'}
              className="h-4 w-4 rounded border-slate-300 text-voya-500"
            />
            Enable family discount on bookings
          </label>
          <Field
            label="Family discount %"
            hint="Staff choose this instead of the member's own rate on the booking screen."
            error={errors['membership.familyDiscountPercent']}
          >
            <Input
              name="membership.familyDiscountPercent"
              inputMode="decimal"
              defaultValue={settings['membership.familyDiscountPercent'] ?? '5'}
            />
          </Field>
        </Card>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
