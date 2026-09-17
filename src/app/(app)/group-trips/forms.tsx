'use client';

import { useActionState } from 'react';
import {
  createDepartureAction,
  createTripTemplate,
  joinWaitlistAction,
  updateDepartureCapacity,
  updateDepartureStatus,
  updateItineraryDay,
  updateWaitlistEntry,
} from '@/server/actions/group.actions';
import { Button, Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';

/** Create a reusable trip template. */
export function TripTemplateForm() {
  const [state, action] = useActionState(createTripTemplate, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action}>
      <FormMessage state={state} />

      <Card title="Trip template" description="One itinerary row is created per day.">
        <FormGrid>
          <Field label="Trip name" required error={errors.name}>
            <Input name="name" placeholder="Georgia Explorer" required />
          </Field>

          <Field label="Destination" error={errors.destination}>
            <Input name="destination" placeholder="Tbilisi, Georgia" />
          </Field>

          <Field label="Duration (days)" required error={errors.durationDays}>
            <Input name="durationDays" inputMode="numeric" defaultValue="5" />
          </Field>

          <Field label="Summary" error={errors.summary} className="sm:col-span-2">
            <Textarea name="summary" placeholder="What the trip covers." />
          </Field>
        </FormGrid>
      </Card>

      <FormActions>
        <SubmitButton>Create template</SubmitButton>
        <LinkButton href="/group-trips" variant="secondary">
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}

/** Edit one day of an itinerary. */
export function ItineraryDayForm({
  templateId,
  day,
}: {
  templateId: string;
  day: { id: string; dayNumber: number; title: string; description: string | null };
}) {
  const [state, action] = useActionState(updateItineraryDay, idleState);

  return (
    <form action={action} className="py-3">
      <FormMessage state={state} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="dayId" value={day.id} />

      <div className="flex items-start gap-3">
        <span className="mt-2 w-14 shrink-0 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Day {day.dayNumber}
        </span>
        <div className="flex-1 space-y-2">
          <Input name="title" defaultValue={day.title} aria-label={`Day ${day.dayNumber} title`} />
          <Textarea
            name="description"
            defaultValue={day.description ?? ''}
            aria-label={`Day ${day.dayNumber} description`}
            className="min-h-16"
          />
        </div>
        <SubmitButton size="sm" variant="ghost" className="mt-1">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}

/** Create a departure, optionally from a template. */
export function DepartureForm({
  templates,
  defaultTemplateId,
}: {
  templates: Array<{ id: string; name: string; destination: string | null; durationDays: number }>;
  defaultTemplateId?: string;
}) {
  const [state, action] = useActionState(createDepartureAction, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action}>
      <FormMessage state={state} />

      <Card
        title="Departure"
        description="Choosing a template copies its itinerary onto this departure."
      >
        <FormGrid>
          <Field label="Trip template" error={errors.templateId} className="sm:col-span-2">
            <Select name="templateId" defaultValue={defaultTemplateId ?? ''}>
              <option value="">— No template —</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.destination ? ` · ${template.destination}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Departure name" required error={errors.name} className="sm:col-span-2">
            <Input name="name" placeholder="Georgia Explorer — October 2026" required />
          </Field>

          <Field label="Destination" error={errors.destination}>
            <Input name="destination" />
          </Field>

          <Field label="Tour leader" error={errors.tourLeaderName}>
            <Input name="tourLeaderName" />
          </Field>

          <Field label="Departure date" required error={errors.departureDate}>
            <Input type="date" name="departureDate" required />
          </Field>

          <Field label="Return date" error={errors.returnDate}>
            <Input type="date" name="returnDate" />
          </Field>

          <Field label="Capacity (seats)" required error={errors.capacity}>
            <Input name="capacity" inputMode="numeric" defaultValue="18" />
          </Field>

          <Field label="Price per seat (BHD)" required error={errors.pricePerSeat}>
            <Input name="pricePerSeat" inputMode="decimal" placeholder="425.000" required />
          </Field>

          <Field
            label="Single supplement (BHD)"
            hint="Charged per seat in a single room."
            error={errors.singleSupplement}
          >
            <Input name="singleSupplement" inputMode="decimal" defaultValue="0" />
          </Field>

          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            <Textarea name="notes" />
          </Field>
        </FormGrid>
      </Card>

      <FormActions>
        <SubmitButton>Create departure</SubmitButton>
        <LinkButton href="/group-trips" variant="secondary">
          Cancel
        </LinkButton>
      </FormActions>
    </form>
  );
}

/** Capacity and status controls on the departure page. */
export function DepartureControls({
  departureId,
  capacity,
  status,
}: {
  departureId: string;
  capacity: number;
  status: string;
}) {
  const [capacityState, capacityAction] = useActionState(updateDepartureCapacity, idleState);
  const [statusState, statusAction] = useActionState(updateDepartureStatus, idleState);

  return (
    <Card title="Manage departure">
      <form action={capacityAction} className="mb-4">
        <FormMessage state={capacityState} />
        <input type="hidden" name="departureId" value={departureId} />

        <Field label="Capacity" hint="Cannot go below the seats already booked.">
          <div className="flex gap-2">
            <Input name="capacity" inputMode="numeric" defaultValue={String(capacity)} />
            <SubmitButton size="sm" variant="secondary">
              Update
            </SubmitButton>
          </div>
        </Field>
      </form>

      <form action={statusAction} className="border-t border-slate-100 pt-4">
        <FormMessage state={statusState} />
        <input type="hidden" name="departureId" value={departureId} />

        <Field label="Status">
          <div className="flex gap-2">
            <Select name="status" defaultValue={status}>
              <option value="DRAFT">Draft</option>
              <option value="OPEN">Open</option>
              <option value="FULL">Full</option>
              <option value="CLOSED">Closed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <SubmitButton size="sm" variant="secondary">
              Update
            </SubmitButton>
          </div>
        </Field>
      </form>
    </Card>
  );
}

/** Add someone to the waitlist. */
export function WaitlistForm({
  departureId,
  customers,
}: {
  departureId: string;
  customers: Array<{ id: string; fullName: string; membershipNumber: string | null }>;
}) {
  const [state, action] = useActionState(joinWaitlistAction, idleState);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="departureId" value={departureId} />

      <FormGrid>
        <Field label="Customer" required error={state.fieldErrors?.customerId}>
          <Select name="customerId" defaultValue="" required>
            <option value="">— Choose a customer —</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName}
                {customer.membershipNumber ? ` · ${customer.membershipNumber}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Seats wanted" error={state.fieldErrors?.requestedSeats}>
          <Input name="requestedSeats" inputMode="numeric" defaultValue="1" />
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          <Input name="notes" placeholder="Optional" />
        </Field>
      </FormGrid>

      <div className="mt-4">
        <SubmitButton size="sm" variant="secondary">
          Add to waitlist
        </SubmitButton>
      </div>
    </form>
  );
}

/** Offer, convert or cancel one waitlist entry. */
export function WaitlistEntryActions({
  entryId,
  status,
}: {
  entryId: string;
  status: string;
}) {
  const [state, action] = useActionState(updateWaitlistEntry, idleState);

  return (
    <form action={action} className="flex flex-wrap gap-1.5">
      <FormMessage state={state} />
      <input type="hidden" name="entryId" value={entryId} />

      {status === 'WAITING' ? (
        <Button type="submit" name="status" value="OFFERED" size="sm" variant="secondary">
          Offer seat
        </Button>
      ) : null}
      <Button type="submit" name="status" value="CONVERTED" size="sm" variant="ghost">
        Booked
      </Button>
      <Button type="submit" name="status" value="CANCELLED" size="sm" variant="ghost">
        Remove
      </Button>
    </form>
  );
}
