'use client';

import { useActionState } from 'react';
import {
  cancelInvoiceAction,
  recordPaymentAction,
  sendInvoiceAction,
  voidPaymentAction,
} from '@/server/actions/invoice.actions';
import { Card, Field, Input, Select, Textarea } from '@/components/ui';
import { ConfirmButton, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';

/** Mark an invoice sent, or cancel it. */
export function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const [sendState, sendAction] = useActionState(sendInvoiceAction, idleState);
  const [cancelState, cancelAction] = useActionState(cancelInvoiceAction, idleState);

  const terminal = status === 'CANCELLED' || status === 'PAID';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormMessage state={sendState} />
      <FormMessage state={cancelState} />

      {status === 'DRAFT' ? (
        <form action={sendAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <SubmitButton size="sm">Mark as sent</SubmitButton>
        </form>
      ) : null}

      {!terminal ? (
        <form action={cancelAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <ConfirmButton
            variant="ghost"
            size="sm"
            confirmText="Cancel this invoice? Only possible while nothing has been paid against it."
          >
            Cancel invoice
          </ConfirmButton>
        </form>
      ) : null}
    </div>
  );
}

/** Record a payment against this invoice. */
export function InvoicePaymentForm({
  invoiceId,
  customerId,
  balance,
}: {
  invoiceId: string;
  customerId: string;
  balance: string;
}) {
  const [state, action] = useActionState(recordPaymentAction, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <Card title="Record a payment">
      <form action={action}>
        <FormMessage state={state} />
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="customerId" value={customerId} />

        <FormGrid>
          <Field label="Amount (BHD)" required error={errors.amount}>
            <Input name="amount" inputMode="decimal" defaultValue={balance} required />
          </Field>

          <Field label="Method" required error={errors.method}>
            <Select name="method" defaultValue="BANK_TRANSFER">
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="BENEFIT_PAY">Benefit Pay</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field label="Received on" required error={errors.paidAt}>
            <Input
              type="date"
              name="paidAt"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>

          <Field label="Reference" error={errors.reference}>
            <Input name="reference" placeholder="Transfer or receipt reference" />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton>Record payment</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Void a payment recorded in error. Admin only. */
export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState(voidPaymentAction, idleState);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <ConfirmButton
        variant="ghost"
        size="sm"
        confirmText="Void this payment? The booking and invoice totals are recalculated."
      >
        Void
      </ConfirmButton>
    </form>
  );
}
