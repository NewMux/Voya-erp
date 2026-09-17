'use client';

import { useActionState } from 'react';
import {
  createRateSheet,
  createSupplierInvoice,
  paySupplierInvoice,
  setSupplierInvoiceDispute,
  toggleSupplierActive,
} from '@/server/actions/supplier.actions';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ConfirmButton, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';
import { CURRENCY_VALUES } from '@/lib/validation';

/** Add a rate sheet version. */
export function RateSheetForm({
  supplierId,
  defaultCurrency,
  nextVersion,
}: {
  supplierId: string;
  defaultCurrency: string;
  nextVersion: number;
}) {
  const [state, action] = useActionState(createRateSheet, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <Card
      title={`Add rate sheet (v${nextVersion})`}
      description="The previous open-ended sheet is closed the day before this one starts."
    >
      <form action={action}>
        <FormMessage state={state} />
        <input type="hidden" name="supplierId" value={supplierId} />

        <FormGrid>
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <Input name="name" placeholder="2027 net fares" required />
          </Field>

          <Field label="Effective from" required error={errors.effectiveFrom}>
            <Input type="date" name="effectiveFrom" required />
          </Field>

          <Field
            label="Effective to"
            hint="Leave blank for an open-ended sheet."
            error={errors.effectiveTo}
          >
            <Input type="date" name="effectiveTo" />
          </Field>

          <Field label="Currency" error={errors.currency}>
            <Select name="currency" defaultValue={defaultCurrency}>
              {CURRENCY_VALUES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" error={errors.notes}>
            <Input name="notes" placeholder="Optional" />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton size="sm">Add rate sheet</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Record an invoice received from the supplier. */
export function SupplierInvoiceForm({
  supplierId,
  defaultCurrency,
}: {
  supplierId: string;
  defaultCurrency: string;
}) {
  const [state, action] = useActionState(createSupplierInvoice, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <Card title="Record supplier invoice">
      <form action={action}>
        <FormMessage state={state} />
        <input type="hidden" name="supplierId" value={supplierId} />

        <FormGrid>
          <Field label="Reference" required error={errors.reference}>
            <Input name="reference" placeholder="INV-2026-0042" required />
          </Field>

          <Field label="Issue date" required error={errors.issueDate}>
            <Input type="date" name="issueDate" required />
          </Field>

          <Field label="Due date" error={errors.dueDate}>
            <Input type="date" name="dueDate" />
          </Field>

          <Field label="Amount" required error={errors.amount}>
            <Input name="amount" inputMode="decimal" placeholder="0.000" required />
          </Field>

          <Field label="Currency" error={errors.currency}>
            <Select name="currency" defaultValue={defaultCurrency}>
              {CURRENCY_VALUES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Rate to BHD"
            hint="Captured at entry time; 1 when already in BHD."
            error={errors.fxRate}
          >
            <Input name="fxRate" inputMode="decimal" defaultValue="1" />
          </Field>

          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            <Textarea name="notes" />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton size="sm">Record invoice</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Pay against, dispute, or clear a dispute on one supplier invoice. */
export function SupplierInvoiceActions({
  invoiceId,
  isDisputed,
  outstanding,
}: {
  invoiceId: string;
  isDisputed: boolean;
  outstanding: string;
}) {
  const [payState, payAction] = useActionState(paySupplierInvoice, idleState);
  const [disputeState, disputeAction] = useActionState(setSupplierInvoiceDispute, idleState);

  return (
    <div className="space-y-2">
      <FormMessage state={payState} />
      <FormMessage state={disputeState} />

      <form action={payAction} className="flex items-end gap-2">
        <input type="hidden" name="supplierInvoiceId" value={invoiceId} />
        <Input
          name="amount"
          inputMode="decimal"
          defaultValue={outstanding}
          aria-label="Payment amount"
          className="w-28"
        />
        <SubmitButton size="sm" variant="secondary">
          Pay
        </SubmitButton>
      </form>

      <form action={disputeAction}>
        <input type="hidden" name="supplierInvoiceId" value={invoiceId} />
        <input type="hidden" name="action" value={isDisputed ? 'resolve' : 'dispute'} />
        {isDisputed ? (
          <Button type="submit" size="sm" variant="ghost">
            Clear dispute
          </Button>
        ) : (
          <>
            <input type="hidden" name="disputeNote" value="Flagged during reconciliation" />
            <Button type="submit" size="sm" variant="ghost">
              Dispute
            </Button>
          </>
        )}
      </form>
    </div>
  );
}

/** Archive or restore a supplier. */
export function ArchiveSupplierButton({
  supplierId,
  isActive,
}: {
  supplierId: string;
  isActive: boolean;
}) {
  const [state, action] = useActionState(toggleSupplierActive, idleState);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={supplierId} />
      <ConfirmButton
        variant={isActive ? 'danger' : 'secondary'}
        size="sm"
        confirmText={
          isActive
            ? 'Archive this supplier? Existing bookings keep their link to it.'
            : 'Restore this supplier?'
        }
      >
        {isActive ? 'Archive supplier' : 'Restore supplier'}
      </ConfirmButton>
    </form>
  );
}
