'use client';

import { useActionState, useEffect, useState } from 'react';
import type { Companion } from '@prisma/client';
import {
  createCompanion,
  deleteCompanion,
  updateCompanion,
} from '@/server/actions/companion.actions';
import { Button, Card, CountryField, Field, Input } from '@/components/ui';
import { ConfirmButton, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';
import { formatDate, toInputDate } from '@/lib/dates';

/**
 * Dependents travelling with this member — a father's children, say. Kept
 * here so their details (passport, DOB) are entered once and then reused
 * from the Companion picker on the New Booking traveler rows, instead of
 * being retyped on every trip. Never registered as customers of their own:
 * no phone or email, no membership.
 */
export function CompanionsPanel({
  customerId,
  companions,
}: {
  customerId: string;
  companions: Companion[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <Card title="Companions" description="Dependents linked to this member's profile.">
      {companions.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">No companions linked yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {companions.map((companion) =>
            editingId === companion.id ? (
              <li key={companion.id} className="py-3">
                <CompanionForm
                  customerId={customerId}
                  companion={companion}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={companion.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{companion.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {companion.relationship ?? 'Companion'}
                    {companion.dateOfBirth ? ` · b. ${formatDate(companion.dateOfBirth)}` : ''}
                    {companion.passportNumber ? ` · ${companion.passportNumber}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(companion.id)}
                  >
                    Edit
                  </Button>
                  <DeleteCompanionButton id={companion.id} />
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {adding ? (
        <div className="border-t border-slate-100 pt-4">
          <CompanionForm customerId={customerId} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
          + Add companion
        </Button>
      )}
    </Card>
  );
}

function DeleteCompanionButton({ id }: { id: string }) {
  const [, action] = useActionState(deleteCompanion, idleState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <ConfirmButton variant="ghost" size="sm" confirmText="Remove this companion?">
        Remove
      </ConfirmButton>
    </form>
  );
}

function CompanionForm({
  customerId,
  companion,
  onDone,
}: {
  customerId: string;
  companion?: Companion;
  onDone: () => void;
}) {
  const [state, action] = useActionState(companion ? updateCompanion : createCompanion, idleState);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && state.message) onDone();
    // onDone identity changes every render (it's an inline closure in the
    // parent); only re-run this when the action result itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="primaryCustomerId" value={customerId} />
      {companion ? <input type="hidden" name="id" value={companion.id} /> : null}

      <FormGrid>
        <Field label="Full name" required error={errors.fullName}>
          <Input name="fullName" defaultValue={companion?.fullName ?? ''} required />
        </Field>
        <Field label="Relationship" error={errors.relationship}>
          <Input
            name="relationship"
            placeholder="Child, spouse…"
            defaultValue={companion?.relationship ?? ''}
          />
        </Field>
        <Field label="Date of birth" error={errors.dateOfBirth}>
          <Input type="date" name="dateOfBirth" defaultValue={toInputDate(companion?.dateOfBirth)} />
        </Field>
        <Field label="Nationality" error={errors.nationality}>
          <CountryField name="nationality" defaultValue={companion?.nationality ?? ''} />
        </Field>
        <Field label="Passport number" error={errors.passportNumber}>
          <Input name="passportNumber" defaultValue={companion?.passportNumber ?? ''} />
        </Field>
        <Field label="Passport expiry" error={errors.passportExpiry}>
          <Input
            type="date"
            name="passportExpiry"
            defaultValue={toInputDate(companion?.passportExpiry)}
          />
        </Field>
      </FormGrid>

      <div className="mt-3 flex gap-2">
        <SubmitButton size="sm">{companion ? 'Save' : 'Add companion'}</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
