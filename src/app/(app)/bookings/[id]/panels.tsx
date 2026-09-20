'use client';

import { useActionState, useState } from 'react';
import type { AttachmentKind, BookingStatus } from '@prisma/client';
import {
  addTraveler,
  deleteAttachment,
  removeTraveler,
  rescheduleInstalment,
  updateBookingStatusAction,
  uploadAttachment,
} from '@/server/actions/booking.actions';
import { Button, Card, CountryField, Field, Input, Select, Textarea } from '@/components/ui';
import {
  recordRefundAction,
  setRefundStatusAction,
} from '@/server/actions/invoice.actions';
import { ConfirmButton, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';

/**
 * Status transition control.
 *
 * Cancelling asks for a reason, because that reason ends up on the refund and
 * in the cancellation record.
 */
export function StatusControl({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  const [state, action] = useActionState(updateBookingStatusAction, idleState);
  const [next, setNext] = useState<BookingStatus>(status);

  return (
    <Card title="Status">
      <form action={action}>
        <FormMessage state={state} />
        <input type="hidden" name="bookingId" value={bookingId} />

        <Field label="Booking status">
          <Select
            name="status"
            value={next}
            onChange={(event) => setNext(event.target.value as BookingStatus)}
          >
            <option value="INQUIRY">Inquiry</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="TICKETED">Ticketed / Vouchered</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>

        {next === 'CANCELLED' ? (
          <div className="mt-4">
            <Field label="Cancellation reason">
              <Textarea name="cancelReason" placeholder="Why is this booking being cancelled?" />
            </Field>
            <p className="mt-2 text-xs text-slate-500">
              Cancelling releases any group seats, stops unsent reminders and closes outstanding
              instalments.
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          {next === 'CANCELLED' ? (
            <ConfirmButton
              variant="danger"
              confirmText="Cancel this booking? Seats are released and reminders stopped."
            >
              Cancel booking
            </ConfirmButton>
          ) : (
            <SubmitButton disabled={next === status}>Update status</SubmitButton>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Travellers on the booking; also the Group Adventure roster source. */
export function TravelersPanel({
  bookingId,
  travelers,
}: {
  bookingId: string;
  travelers: Array<{
    id: string;
    fullName: string;
    type: string;
    passportNumber: string | null;
    nationality: string | null;
  }>;
}) {
  const [addState, addAction] = useActionState(addTraveler, idleState);
  const [removeState, removeAction] = useActionState(removeTraveler, idleState);

  return (
    <Card title="Travellers" description="Used for the group roster and rooming list.">
      <FormMessage state={removeState} />

      {travelers.length > 0 ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {travelers.map((traveler) => (
            <li key={traveler.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  {traveler.fullName}
                </p>
                <p className="text-xs text-slate-500">
                  {traveler.type.toLowerCase()}
                  {traveler.passportNumber ? ` · ${traveler.passportNumber}` : ''}
                  {traveler.nationality ? ` · ${traveler.nationality}` : ''}
                </p>
              </div>
              <form action={removeAction}>
                <input type="hidden" name="travelerId" value={traveler.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">No travellers recorded yet.</p>
      )}

      <form action={addAction} className="border-t border-slate-100 pt-4">
        <FormMessage state={addState} />
        <input type="hidden" name="bookingId" value={bookingId} />

        <FormGrid>
          <Field label="Full name" required error={addState.fieldErrors?.fullName}>
            <Input name="fullName" required placeholder="As per passport" />
          </Field>

          <Field label="Type">
            <Select name="type" defaultValue="ADULT">
              <option value="ADULT">Adult</option>
              <option value="CHILD">Child</option>
              <option value="INFANT">Infant</option>
            </Select>
          </Field>

          <Field label="Passport number">
            <Input name="passportNumber" />
          </Field>

          <Field label="Passport expiry">
            <Input type="date" name="passportExpiry" />
          </Field>

          <Field label="Nationality">
            <CountryField name="nationality" />
          </Field>

          <Field label="Phone">
            <Input name="phone" />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton size="sm" variant="secondary">
            Add traveller
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  TICKET: 'Ticket',
  VOUCHER: 'Voucher',
  VISA_COPY: 'Visa copy',
  PASSPORT_COPY: 'Passport copy',
  PHOTO: 'Photo',
  INVOICE: 'Invoice',
  OTHER: 'Other',
};

/** Ticket PDFs, hotel vouchers and visa copies. */
export function AttachmentsPanel({
  bookingId,
  attachments,
}: {
  bookingId: string;
  attachments: Array<{
    id: string;
    kind: AttachmentKind;
    fileKey: string;
    fileName: string;
    sizeBytes: number;
  }>;
}) {
  const [uploadState, uploadAction] = useActionState(uploadAttachment, idleState);
  const [deleteState, deleteAction] = useActionState(deleteAttachment, idleState);

  return (
    <Card title="Attachments" description="Ticket PDFs, hotel vouchers, visa copies.">
      <FormMessage state={deleteState} />

      {attachments.length > 0 ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <a
                  href={`/api/files/${attachment.fileKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-voya-800 hover:underline"
                >
                  {attachment.fileName}
                </a>
                <p className="text-xs text-slate-500">
                  {ATTACHMENT_LABELS[attachment.kind]} ·{' '}
                  {(attachment.sizeBytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <form action={deleteAction}>
                <input type="hidden" name="attachmentId" value={attachment.id} />
                <ConfirmButton variant="ghost" size="sm" confirmText="Remove this attachment?">
                  Remove
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">Nothing attached yet.</p>
      )}

      <form action={uploadAction} className="border-t border-slate-100 pt-4">
        <FormMessage state={uploadState} />
        <input type="hidden" name="bookingId" value={bookingId} />

        <FormGrid>
          <Field label="Document type">
            <Select name="kind" defaultValue="TICKET">
              {(Object.keys(ATTACHMENT_LABELS) as AttachmentKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {ATTACHMENT_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="File" hint="PDF, image or office document.">
            <input
              type="file"
              name="file"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-voya-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-voya-800 hover:file:bg-voya-200"
            />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton size="sm" variant="secondary" pendingLabel="Uploading…">
            Upload
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Change an instalment's due date. */
export function RescheduleForm({
  bookingId,
  scheduleItemId,
  dueDate,
}: {
  bookingId: string;
  scheduleItemId: string;
  dueDate: string;
}) {
  const [state, action] = useActionState(rescheduleInstalment, idleState);

  return (
    <form action={action} className="flex items-center gap-1.5">
      <FormMessage state={state} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="scheduleItemId" value={scheduleItemId} />
      <Input type="date" name="dueDate" defaultValue={dueDate} className="w-36" />
      <SubmitButton size="sm" variant="ghost">
        Save
      </SubmitButton>
    </form>
  );
}

/**
 * Record a refund against a cancelled or amended booking (PRD section 4.3).
 *
 * A refund raised as Pending does not change what the customer has paid; only
 * marking it Processed does, so approval and disbursement stay distinct.
 */
export function RefundForm({
  bookingId,
  maxAmount,
}: {
  bookingId: string;
  maxAmount: string;
}) {
  const [state, action] = useActionState(recordRefundAction, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <Card title="Record a refund">
      <form action={action}>
        <FormMessage state={state} />
        <input type="hidden" name="bookingId" value={bookingId} />

        <FormGrid>
          <Field
            label="Amount (BHD)"
            required
            hint={`Received to date: ${maxAmount}`}
            error={errors.amount}
          >
            <Input name="amount" inputMode="decimal" defaultValue={maxAmount} required />
          </Field>

          <Field label="Method" error={errors.method}>
            <Select name="method" defaultValue="BANK_TRANSFER">
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="BENEFIT_PAY">Benefit Pay</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field label="Status" hint="Only Processed reduces what the customer has paid.">
            <Select name="status" defaultValue="PENDING">
              <option value="PENDING">Pending approval</option>
              <option value="PROCESSED">Processed</option>
            </Select>
          </Field>

          <Field label="Reference" error={errors.reference}>
            <Input name="reference" />
          </Field>

          <Field label="Reason" className="sm:col-span-2" error={errors.reason}>
            <Textarea name="reason" placeholder="Why is this being refunded?" />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton size="sm" variant="secondary">
            Record refund
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Approve or reject a pending refund. */
export function RefundStatusActions({ refundId }: { refundId: string }) {
  const [state, action] = useActionState(setRefundStatusAction, idleState);

  return (
    <form action={action} className="flex gap-1.5">
      <FormMessage state={state} />
      <input type="hidden" name="refundId" value={refundId} />
      <Button type="submit" name="status" value="PROCESSED" size="sm" variant="secondary">
        Mark processed
      </Button>
      <Button type="submit" name="status" value="REJECTED" size="sm" variant="ghost">
        Reject
      </Button>
    </form>
  );
}
