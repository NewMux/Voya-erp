'use client';

import { useActionState, useState, useTransition } from 'react';
import type { VisaCountryReference } from '@prisma/client';
import { createBookingAction } from '@/server/actions/booking.actions';
import { lookupVisaCountry } from '@/server/actions/visa.actions';
import {
  Alert,
  Card,
  CountryField,
  Field,
  Input,
  LinkButton,
  Select,
  Textarea,
} from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';
import { CustomerPicker, type PickerCustomer } from '../customer-picker';

/**
 * Dedicated Visa booking flow.
 *
 * Selecting a destination country looks up VisaCountryReference and
 * auto-populates the embassy, fee, required documents, terms and processing
 * time — staff no longer retype what is already on file for that country.
 * Submits to the same createBookingAction as every other booking type; only
 * the screen is specialised, not the underlying save.
 */
export function VisaBookingForm({
  initialCustomer,
  canSeeCost,
}: {
  initialCustomer: PickerCustomer | null;
  canSeeCost: boolean;
}) {
  const [state, formAction] = useActionState(createBookingAction, idleState);
  const errors = state.fieldErrors ?? {};

  const [customer, setCustomer] = useState<PickerCustomer | null>(initialCustomer);
  const [country, setCountry] = useState('');
  const [reference, setReference] = useState<VisaCountryReference | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLookingUp, startLookup] = useTransition();
  const [sellingAmount, setSellingAmount] = useState('0');
  const [costAmount, setCostAmount] = useState('0');

  function handleCountryBlur() {
    const trimmed = country.trim();
    if (!trimmed) {
      setReference(null);
      setNotFound(false);
      return;
    }
    startLookup(async () => {
      const found = await lookupVisaCountry(trimmed);
      setReference(found);
      setNotFound(!found);
      if (found) {
        setSellingAmount(found.visaFeeAmount.toString());
        setCostAmount(found.visaFeeAmount.toString());
      }
    });
  }

  return (
    <form action={formAction}>
      <FormMessage state={state} />

      <input type="hidden" name="type" value="VISA" />
      <input type="hidden" name="customerId" value={customer?.id ?? ''} />
      <input type="hidden" name="adults" value="1" />
      <input type="hidden" name="children" value="0" />
      <input type="hidden" name="infants" value="0" />
      <input type="hidden" name="depositType" value="NONE" />
      <input type="hidden" name="depositValue" value="" />
      <input type="hidden" name="status" value="INQUIRY" />
      {!canSeeCost ? (
        <>
          <input type="hidden" name="costAmount" value="0" />
          <input type="hidden" name="costCurrency" value="BHD" />
          <input type="hidden" name="fxRate" value="1" />
        </>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card
            title="Customer"
            description="Search by membership number first — it auto-fills the profile."
          >
            <CustomerPicker value={customer} onChange={setCustomer} />
            {errors.customerId ? (
              <p className="mt-2 text-xs text-red-600">{errors.customerId}</p>
            ) : null}
          </Card>

          <Card title="Destination">
            <FormGrid>
              <Field
                label="Destination country"
                required
                error={errors.destinationCountry}
                className="sm:col-span-2"
              >
                <CountryField
                  name="destinationCountry"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setReference(null);
                    setNotFound(false);
                  }}
                  onBlur={handleCountryBlur}
                />
              </Field>

              <Field label="Visa type" required error={errors.visaType}>
                <Input
                  name="visaType"
                  placeholder="Tourist, single entry"
                  defaultValue=""
                />
              </Field>

              <Field label="Processing status">
                <Select name="processingStatus" defaultValue="NOT_STARTED">
                  <option value="NOT_STARTED">Not started</option>
                  <option value="DOCUMENTS_PENDING">Documents pending</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ISSUED">Issued</option>
                </Select>
              </Field>
            </FormGrid>

            {isLookingUp ? (
              <p className="mt-4 text-sm text-slate-500">Looking up {country}…</p>
            ) : reference ? (
              <div className="mt-4 rounded-md border border-voya-200 bg-voya-50 p-4 text-sm">
                <p className="font-medium text-voya-900">On file for {reference.country}</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  <div>
                    <dt className="inline text-slate-500">Embassy: </dt>
                    <dd className="inline">{reference.embassyName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Fee: </dt>
                    <dd className="inline">
                      {reference.visaFeeAmount.toString()} {reference.visaFeeCurrency}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Processing time: </dt>
                    <dd className="inline">
                      {reference.processingTimeDays ? `${reference.processingTimeDays} days` : '—'}
                    </dd>
                  </div>
                </dl>
                {reference.requiredDocuments ? (
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">
                    <span className="text-slate-500">Documents: </span>
                    {reference.requiredDocuments}
                  </p>
                ) : null}
                {reference.termsAndConditions ? (
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">
                    <span className="text-slate-500">Terms: </span>
                    {reference.termsAndConditions}
                  </p>
                ) : null}
              </div>
            ) : notFound ? (
              <div className="mt-4">
                <Alert tone="warning">
                  Nothing on file for this country yet.{' '}
                  <LinkButton href="/settings/visa-countries/new" size="sm" variant="secondary">
                    Add it
                  </LinkButton>
                </Alert>
              </div>
            ) : null}
          </Card>

          <Card title="Notes">
            <Field label="Internal notes">
              <Textarea name="notes" />
            </Field>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Pricing">
            {canSeeCost ? (
              <>
                <input type="hidden" name="costCurrency" value="BHD" />
                <input type="hidden" name="fxRate" value="1" />
                <Field
                  label="Cost price"
                  hint="Pre-filled from the visa fee on file, once a country is chosen."
                  error={errors.costAmount}
                >
                  <Input
                    name="costAmount"
                    inputMode="decimal"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            <Field
              label="Selling price (BHD)"
              required
              error={errors.sellingAmount}
              className="mt-4"
            >
              <Input
                name="sellingAmount"
                inputMode="decimal"
                value={sellingAmount}
                onChange={(e) => setSellingAmount(e.target.value)}
              />
            </Field>
          </Card>

          <FormActions>
            <SubmitButton>Create visa booking</SubmitButton>
            <LinkButton href="/bookings" variant="secondary">
              Cancel
            </LinkButton>
          </FormActions>
        </div>
      </div>
    </form>
  );
}
