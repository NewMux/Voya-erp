'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createInvoiceAction, bookingsForInvoice } from '@/server/actions/invoice.actions';
import { Alert, Button, Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { FormActions, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';
import { CustomerPicker, type PickerCustomer } from '../../bookings/new/customer-picker';

/**
 * Invoice builder.
 *
 * Choosing a customer loads their un-invoiced bookings; ticking them appends a
 * pre-described line each, which is how the PRD's "one invoice can bundle
 * multiple bookings" works in practice. Lines stay freely editable, and are
 * posted as a JSON field because FormData cannot carry nested arrays.
 */

type Line = {
  key: string;
  bookingId: string | null;
  description: string;
  descriptionAr: string;
  quantity: string;
  unitPrice: string;
};

type BookingOption = {
  id: string;
  reference: string;
  type: string;
  netSellingAmount: string;
  description: string;
};

let lineCounter = 0;
const newKey = () => `line-${++lineCounter}`;

function emptyLine(): Line {
  return {
    key: newKey(),
    bookingId: null,
    description: '',
    descriptionAr: '',
    quantity: '1',
    unitPrice: '0',
  };
}

function todayInput(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function InvoiceBuilder({
  initialCustomer,
  preselectedBookingId,
}: {
  initialCustomer: PickerCustomer | null;
  preselectedBookingId?: string;
}) {
  const [state, formAction] = useActionState(createInvoiceAction, idleState);
  const [customer, setCustomer] = useState<PickerCustomer | null>(initialCustomer);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [discount, setDiscount] = useState('0');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load the customer's un-invoiced bookings whenever the customer changes.
  useEffect(() => {
    if (!customer || loadedFor === customer.id) return;

    let cancelled = false;
    void bookingsForInvoice(customer.id).then((found) => {
      if (cancelled) return;
      setBookings(found);
      setLoadedFor(customer.id);

      // Arriving from a booking page pre-selects that booking.
      const preselect = preselectedBookingId
        ? found.find((b) => b.id === preselectedBookingId)
        : undefined;
      if (preselect) {
        setLines([
          {
            key: newKey(),
            bookingId: preselect.id,
            description: preselect.description,
            descriptionAr: '',
            quantity: '1',
            unitPrice: preselect.netSellingAmount,
          },
        ]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [customer, loadedFor, preselectedBookingId]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) =>
        sum + (Number.parseFloat(line.quantity) || 0) * (Number.parseFloat(line.unitPrice) || 0),
      0,
    );
    const discountValue = Math.min(Number.parseFloat(discount) || 0, subtotal);
    return { subtotal, discount: discountValue, total: subtotal - discountValue };
  }, [lines, discount]);

  const addBooking = (booking: BookingOption) => {
    if (lines.some((line) => line.bookingId === booking.id)) return;

    setLines((current) => {
      // Replace the untouched starter row rather than leaving it empty.
      const meaningful = current.filter(
        (line) => line.description.trim() !== '' || line.bookingId !== null,
      );
      return [
        ...meaningful,
        {
          key: newKey(),
          bookingId: booking.id,
          description: booking.description,
          descriptionAr: '',
          quantity: '1',
          unitPrice: booking.netSellingAmount,
        },
      ];
    });
  };

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const removeLine = (key: string) =>
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      return next.length > 0 ? next : [emptyLine()];
    });

  const payloadLines = lines
    .filter((line) => line.description.trim() !== '')
    .map((line) => ({
      bookingId: line.bookingId,
      description: line.description.trim(),
      descriptionAr: line.descriptionAr.trim() || null,
      quantity: line.quantity || '1',
      unitPrice: line.unitPrice || '0',
    }));

  const available = bookings.filter(
    (booking) => !lines.some((line) => line.bookingId === booking.id),
  );

  return (
    <form action={formAction}>
      <FormMessage state={state} />

      <input type="hidden" name="customerId" value={customer?.id ?? ''} />
      <input type="hidden" name="lines" value={JSON.stringify(payloadLines)} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Customer">
            <CustomerPicker
              value={customer}
              onChange={(next) => {
                setCustomer(next);
                setLoadedFor(null);
                setBookings([]);
                setLines([emptyLine()]);
              }}
            />
          </Card>

          {customer && available.length > 0 ? (
            <Card
              title="Un-invoiced bookings"
              description="Add any of these to bundle them onto this invoice."
            >
              <ul className="divide-y divide-slate-100">
                {available.map((booking) => (
                  <li key={booking.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {booking.reference}
                      </p>
                      <p className="truncate text-xs text-slate-500">{booking.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums">{booking.netSellingAmount}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => addBooking(booking)}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card
            title="Lines"
            actions={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add line
              </Button>
            }
          >
            <div className="space-y-4">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="rounded-md border border-slate-200 p-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <Field label="Description" className="sm:col-span-8">
                      <Input
                        value={line.description}
                        onChange={(event) =>
                          updateLine(line.key, { description: event.target.value })
                        }
                        placeholder="Flight BAH to TBS, Gulf Air"
                      />
                    </Field>

                    <Field label="Qty" className="sm:col-span-2">
                      <Input
                        value={line.quantity}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(line.key, { quantity: event.target.value })
                        }
                      />
                    </Field>

                    <Field label="Unit price" className="sm:col-span-2">
                      <Input
                        value={line.unitPrice}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(line.key, { unitPrice: event.target.value })
                        }
                      />
                    </Field>

                    <Field
                      label="Arabic description"
                      hint="Shown on the Arabic and bilingual templates."
                      className="sm:col-span-10"
                    >
                      <Input
                        dir="rtl"
                        value={line.descriptionAr}
                        onChange={(event) =>
                          updateLine(line.key, { descriptionAr: event.target.value })
                        }
                      />
                    </Field>

                    <div className="flex items-end sm:col-span-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(line.key)}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>

                  {line.bookingId ? (
                    <p className="mt-2 text-xs text-slate-500">Linked to a booking.</p>
                  ) : null}
                </div>
              ))}
            </div>

            {payloadLines.length === 0 ? (
              <div className="mt-4">
                <Alert tone="warning">Add at least one line with a description.</Alert>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Invoice">
            <div className="space-y-4">
              <Field label="Issue date" required error={state.fieldErrors?.issueDate}>
                <Input type="date" name="issueDate" defaultValue={todayInput()} required />
              </Field>

              <Field label="Due date" required error={state.fieldErrors?.dueDate}>
                <Input type="date" name="dueDate" defaultValue={todayInput(14)} required />
              </Field>

              <Field
                label="Template language"
                hint="The PDF can still be previewed in any language."
              >
                <Select name="language" defaultValue="EN">
                  <option value="EN">English</option>
                  <option value="AR">Arabic</option>
                  <option value="BILINGUAL">Bilingual</option>
                </Select>
              </Field>

              <Field label="Invoice discount (BHD)" error={state.fieldErrors?.discountTotal}>
                <Input
                  name="discountTotal"
                  inputMode="decimal"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </Field>
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Subtotal</dt>
                <dd className="tabular-nums">{totals.subtotal.toFixed(3)}</dd>
              </div>
              {totals.discount > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-600">Discount</dt>
                  <dd className="tabular-nums">−{totals.discount.toFixed(3)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-slate-100 pt-2 font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{totals.total.toFixed(3)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Notes">
            <div className="space-y-4">
              <Field label="Notes (English)">
                <Textarea name="notes" />
              </Field>
              <Field label="Notes (Arabic)">
                <Textarea name="notesAr" dir="rtl" />
              </Field>
              <Field label="Terms" hint="Falls back to the company default when blank.">
                <Textarea name="terms" />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <FormActions>
        <SubmitButton disabled={!customer || payloadLines.length === 0}>
          Create invoice
        </SubmitButton>
        <LinkButton href="/invoices" variant="secondary">
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}
