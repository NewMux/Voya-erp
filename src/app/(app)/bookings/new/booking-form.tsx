'use client';

import { useActionState, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBookingAction } from '@/server/actions/booking.actions';
import { Alert, Badge, Card, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { FormActions, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';
import { CURRENCY_VALUES } from '@/lib/validation';
import { CustomerPicker, type PickerCustomer } from './customer-picker';

/**
 * New booking form.
 *
 * One form for all six booking types: the shared fields stay put and the
 * type-specific panel swaps, so staff learn one screen rather than six. The
 * live totals mirror exactly what `computeBookingFinancials` will store, so
 * what is shown is what gets saved.
 */

export type DepartureOption = {
  id: string;
  name: string;
  departureDate: string;
  capacity: number;
  seatsBooked: number;
  pricePerSeat: string;
  singleSupplement: string;
  costPerSeat: string;
};

export type SupplierOption = {
  id: string;
  name: string;
  type: string;
  defaultCurrency: string;
};

type PackageComponentRow = {
  kind: 'FLIGHT' | 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';
  description: string;
  costAmount: string;
};

const PACKAGE_COMPONENT_KINDS: PackageComponentRow['kind'][] = [
  'FLIGHT',
  'HOTEL',
  'TRANSPORT',
  'ACTIVITY',
  'OTHER',
];

const BOOKING_TYPES = [
  { value: 'FLIGHT', label: 'Flight' },
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'PACKAGE', label: 'Package' },
  { value: 'VISA', label: 'Visa' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'GROUP_ADVENTURE', label: 'Group Adventure' },
] as const;

type BookingType = (typeof BOOKING_TYPES)[number]['value'];

/** Round to three decimals for display; BHD has three. */
function money(value: number): string {
  if (!Number.isFinite(value)) return '0.000';
  return value.toFixed(3);
}

export function BookingForm({
  suppliers,
  departures,
  initialCustomer,
  canSeeCost,
}: {
  suppliers: SupplierOption[];
  departures: DepartureOption[];
  initialCustomer: PickerCustomer | null;
  canSeeCost: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(createBookingAction, idleState);
  const errors = state.fieldErrors ?? {};

  const [type, setType] = useState<BookingType>('FLIGHT');
  const [customer, setCustomer] = useState<PickerCustomer | null>(initialCustomer);
  const [costAmount, setCostAmount] = useState('0');
  const [costCurrency, setCostCurrency] = useState('BHD');
  const [rate, setRate] = useState('1');
  const [sellingAmount, setSellingAmount] = useState('0');
  const [depositType, setDepositType] = useState<'PERCENT' | 'AMOUNT' | 'NONE'>('PERCENT');
  const [depositValue, setDepositValue] = useState('30');
  const [departureId, setDepartureId] = useState('');
  const [seats, setSeats] = useState('1');
  const [packageComponents, setPackageComponents] = useState<PackageComponentRow[]>([]);

  const selectedDeparture = departures.find((d) => d.id === departureId) ?? null;

  // Mirrors computeBookingFinancials exactly, so the preview matches the save.
  const totals = useMemo(() => {
    const selling = Number.parseFloat(sellingAmount) || 0;
    const discountPercent = customer?.membership?.active
      ? Number.parseFloat(customer.membership.discountPercent)
      : 0;
    const rawDiscount = (selling * discountPercent) / 100;
    const discount = Math.min(rawDiscount, selling);
    const net = selling - discount;
    const costBase =
      type === 'GROUP_ADVENTURE' && selectedDeparture
        ? (Number.parseFloat(selectedDeparture.costPerSeat) || 0) *
          (Number.parseInt(seats, 10) || 0)
        : type === 'PACKAGE'
          ? packageComponents.reduce((sum, c) => sum + (Number.parseFloat(c.costAmount) || 0), 0)
          : (Number.parseFloat(costAmount) || 0) * (Number.parseFloat(rate) || 0);

    const depositRaw =
      depositType === 'NONE'
        ? 0
        : depositType === 'PERCENT'
          ? (net * (Number.parseFloat(depositValue) || 0)) / 100
          : Number.parseFloat(depositValue) || 0;
    const deposit = Math.max(0, Math.min(depositRaw, net));

    return {
      discountPercent,
      discount,
      net,
      margin: net - costBase,
      costBase,
      deposit,
      balance: net - deposit,
    };
  }, [
    sellingAmount,
    costAmount,
    rate,
    customer,
    depositType,
    depositValue,
    type,
    selectedDeparture,
    seats,
    packageComponents,
  ]);

  const seatsRemaining = selectedDeparture
    ? selectedDeparture.capacity - selectedDeparture.seatsBooked
    : null;
  const seatsRequested = Number.parseInt(seats, 10) || 0;
  const overCapacity = seatsRemaining !== null && seatsRequested > seatsRemaining;

  return (
    <form action={formAction}>
      <FormMessage state={state} />

      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="customerId" value={customer?.id ?? ''} />
      <input
        type="hidden"
        name="packageComponentsJson"
        value={type === 'PACKAGE' ? JSON.stringify(packageComponents) : '[]'}
      />

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

          <Card title="Booking">
            <FormGrid>
              <Field label="Booking type" required>
                <Select
                  value={type}
                  onChange={(e) => {
                    const next = e.target.value as BookingType;
                    if (next === 'VISA') {
                      // Visa has its own dedicated screen — the country lookup
                      // auto-fills embassy/fee/documents, which this generic
                      // form has no room for.
                      router.push(
                        customer?.id
                          ? `/bookings/new/visa?customerId=${customer.id}`
                          : '/bookings/new/visa',
                      );
                      return;
                    }
                    setType(next);
                  }}
                >
                  {BOOKING_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Supplier" error={errors.supplierId}>
                <Select
                  name="supplierId"
                  defaultValue=""
                  onChange={(event) => {
                    const supplier = suppliers.find((s) => s.id === event.target.value);
                    if (supplier) setCostCurrency(supplier.defaultCurrency);
                  }}
                >
                  <option value="">— None —</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Departure date" error={errors.departureDate}>
                <Input type="date" name="departureDate" />
              </Field>

              <Field label="Return date" error={errors.returnDate}>
                <Input type="date" name="returnDate" />
              </Field>

              <Field label="Adults" required error={errors.adults}>
                <Input name="adults" inputMode="numeric" defaultValue="1" />
              </Field>

              <Field label="Children" error={errors.children}>
                <Input name="children" inputMode="numeric" defaultValue="0" />
              </Field>

              <Field label="Infants" error={errors.infants}>
                <Input name="infants" inputMode="numeric" defaultValue="0" />
              </Field>

              <Field label="Status" error={errors.status}>
                <Select name="status" defaultValue="INQUIRY">
                  <option value="INQUIRY">Inquiry</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="TICKETED">Ticketed / Vouchered</option>
                </Select>
              </Field>
            </FormGrid>
          </Card>

          <TypePanel
            type={type}
            errors={errors}
            departures={departures}
            departureId={departureId}
            setDepartureId={setDepartureId}
            seats={seats}
            setSeats={setSeats}
            selectedDeparture={selectedDeparture}
            seatsRemaining={seatsRemaining}
            overCapacity={overCapacity}
            onPriceFromDeparture={(price) => setSellingAmount(price)}
            packageComponents={packageComponents}
            setPackageComponents={setPackageComponents}
            canSeeCost={canSeeCost}
          />

          <Card title="Notes">
            <Field label="Internal notes" error={errors.notes}>
              <Textarea name="notes" />
            </Field>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Pricing">
            <div className="space-y-4">
              {type === 'GROUP_ADVENTURE' || type === 'PACKAGE' ? (
                <>
                  {/* Cost is derived, not entered directly: from the
                      departure for a Group Adventure, from the sum of the
                      bundled components for a Package. */}
                  {canSeeCost ? (
                    <Field
                      label="Cost price"
                      hint={
                        type === 'GROUP_ADVENTURE'
                          ? 'Set on the departure, not here.'
                          : 'Sum of the package components below.'
                      }
                    >
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {money(totals.costBase)} BHD
                      </p>
                    </Field>
                  ) : null}
                  <input type="hidden" name="costAmount" value="0" />
                  <input type="hidden" name="costCurrency" value="BHD" />
                  <input type="hidden" name="fxRate" value="1" />
                </>
              ) : canSeeCost ? (
                <>
                  <Field label="Cost price" required error={errors.costAmount}>
                    <Input
                      name="costAmount"
                      inputMode="decimal"
                      value={costAmount}
                      onChange={(e) => setCostAmount(e.target.value)}
                    />
                  </Field>

                  <Field label="Cost currency" error={errors.costCurrency}>
                    <Select
                      name="costCurrency"
                      value={costCurrency}
                      onChange={(e) => setCostCurrency(e.target.value)}
                    >
                      {CURRENCY_VALUES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {costCurrency !== 'BHD' ? (
                    <Field
                      label="Rate to BHD"
                      hint="Captured now and kept with the booking."
                      error={errors.fxRate}
                    >
                      <Input
                        name="fxRate"
                        inputMode="decimal"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                      />
                    </Field>
                  ) : (
                    <input type="hidden" name="fxRate" value="1" />
                  )}
                </>
              ) : (
                <>
                  {/* Reservations staff do not price the cost side. */}
                  <input type="hidden" name="costAmount" value="0" />
                  <input type="hidden" name="costCurrency" value="BHD" />
                  <input type="hidden" name="fxRate" value="1" />
                </>
              )}

              <Field label="Selling price (BHD)" required error={errors.sellingAmount}>
                <Input
                  name="sellingAmount"
                  inputMode="decimal"
                  value={sellingAmount}
                  onChange={(e) => setSellingAmount(e.target.value)}
                />
              </Field>
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              {totals.discountPercent > 0 ? (
                <div className="flex justify-between text-gold-700">
                  <dt>Member discount ({totals.discountPercent}%)</dt>
                  <dd className="tabular-nums">−{money(totals.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <dt>Customer pays</dt>
                <dd className="tabular-nums">{money(totals.net)}</dd>
              </div>
              {canSeeCost ? (
                <>
                  <div className="flex justify-between text-slate-500">
                    <dt>Cost (BHD)</dt>
                    <dd className="tabular-nums">{money(totals.costBase)}</dd>
                  </div>
                  <div
                    className={`flex justify-between font-medium ${
                      totals.margin < 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    <dt>Margin</dt>
                    <dd className="tabular-nums">{money(totals.margin)}</dd>
                  </div>
                </>
              ) : null}
            </dl>

            {canSeeCost && totals.margin < 0 ? (
              <div className="mt-3">
                <Alert tone="warning">This booking sells below cost.</Alert>
              </div>
            ) : null}
          </Card>

          <Card title="Payment plan" description="Applies to every booking type.">
            <div className="space-y-4">
              <Field label="Deposit">
                <Select
                  name="depositType"
                  value={depositType}
                  onChange={(e) =>
                    setDepositType(e.target.value as 'PERCENT' | 'AMOUNT' | 'NONE')
                  }
                >
                  <option value="PERCENT">Percentage of total</option>
                  <option value="AMOUNT">Fixed amount</option>
                  <option value="NONE">No deposit — pay in full</option>
                </Select>
              </Field>

              {depositType !== 'NONE' ? (
                <Field
                  label={depositType === 'PERCENT' ? 'Deposit %' : 'Deposit amount (BHD)'}
                  error={errors.depositValue}
                >
                  <Input
                    name="depositValue"
                    inputMode="decimal"
                    value={depositValue}
                    onChange={(e) => setDepositValue(e.target.value)}
                  />
                </Field>
              ) : (
                <input type="hidden" name="depositValue" value="" />
              )}

              <Field
                label="Balance due date"
                hint="e.g. 45 days before travel. Defaults to the departure date."
                error={errors.balanceDueDate}
              >
                <Input type="date" name="balanceDueDate" />
              </Field>
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Deposit due now</dt>
                <dd className="tabular-nums">{money(totals.deposit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Balance</dt>
                <dd className="tabular-nums">{money(totals.balance)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Creating booking…" disabled={!customer || overCapacity}>
          Create booking
        </SubmitButton>
        <LinkButton href="/bookings" variant="secondary">
          Cancel
        </LinkButton>
        {!customer ? (
          <span className="text-sm text-slate-500">Choose a customer to continue.</span>
        ) : null}
      </FormActions>
    </form>
  );
}

/** The panel that swaps with the booking type. */
function TypePanel({
  type,
  errors,
  departures,
  departureId,
  setDepartureId,
  seats,
  setSeats,
  selectedDeparture,
  seatsRemaining,
  overCapacity,
  onPriceFromDeparture,
  packageComponents,
  setPackageComponents,
  canSeeCost,
}: {
  type: BookingType;
  errors: Record<string, string>;
  departures: DepartureOption[];
  departureId: string;
  setDepartureId: (value: string) => void;
  seats: string;
  setSeats: (value: string) => void;
  selectedDeparture: DepartureOption | null;
  seatsRemaining: number | null;
  overCapacity: boolean;
  onPriceFromDeparture: (price: string) => void;
  packageComponents: PackageComponentRow[];
  setPackageComponents: (update: (rows: PackageComponentRow[]) => PackageComponentRow[]) => void;
  canSeeCost: boolean;
}) {
  switch (type) {
    case 'FLIGHT':
      return (
        <Card title="Flight details">
          <FormGrid>
            <Field label="Airline" required error={errors.airline}>
              <Input name="airline" placeholder="Gulf Air" />
            </Field>
            <Field label="PNR" error={errors.pnr}>
              <Input name="pnr" className="uppercase" />
            </Field>
            <Field label="From" required error={errors.routeFrom}>
              <Input name="routeFrom" placeholder="BAH" className="uppercase" />
            </Field>
            <Field label="To" required error={errors.routeTo}>
              <Input name="routeTo" placeholder="TBS" className="uppercase" />
            </Field>
            <Field label="Class" error={errors.cabinClass}>
              <Input name="cabinClass" placeholder="Economy" />
            </Field>
            <Field label="Baggage allowance" error={errors.baggageAllowance}>
              <Input name="baggageAllowance" placeholder="2 × 23 kg" />
            </Field>
          </FormGrid>
        </Card>
      );

    case 'HOTEL':
      return (
        <Card title="Hotel details">
          <FormGrid>
            <Field label="Property name" required error={errors.propertyName}>
              <Input name="propertyName" />
            </Field>
            <Field label="City" error={errors.city}>
              <Input name="city" />
            </Field>
            <Field label="Room type" error={errors.roomType}>
              <Input name="roomType" placeholder="Double, sea view" />
            </Field>
            <Field label="Board basis" error={errors.boardBasis}>
              <Select name="boardBasis" defaultValue="BB">
                <option value="RO">Room only (RO)</option>
                <option value="BB">Bed &amp; breakfast (BB)</option>
                <option value="HB">Half board (HB)</option>
                <option value="FB">Full board (FB)</option>
              </Select>
            </Field>
            <Field label="Check-in" required error={errors.checkIn}>
              <Input type="date" name="checkIn" />
            </Field>
            <Field label="Check-out" required error={errors.checkOut}>
              <Input type="date" name="checkOut" />
            </Field>
            <Field label="Rooms" error={errors.rooms}>
              <Input name="rooms" inputMode="numeric" defaultValue="1" />
            </Field>
          </FormGrid>
        </Card>
      );

    case 'VISA':
      // Unreachable — selecting Visa in the type dropdown navigates straight
      // to the dedicated flow at /bookings/new/visa instead of setting this
      // state. Kept only so the switch stays exhaustive over BookingType.
      return null;

    case 'TRANSPORT':
      return (
        <Card title="Transport details">
          <FormGrid>
            <Field label="Transport type" required error={errors.transportKind}>
              <Select name="transportKind" defaultValue="AIRPORT_TRANSFER">
                <option value="AIRPORT_TRANSFER">Airport transfer</option>
                <option value="CAR_RENTAL">Car rental</option>
                <option value="INTER_CITY">Inter-city transport</option>
              </Select>
            </Field>
            <Field label="Vehicle type" error={errors.vehicleType}>
              <Input name="vehicleType" placeholder="Sedan, 4 pax" />
            </Field>
            <Field label="Pickup location" required error={errors.pickupLocation}>
              <Input name="pickupLocation" placeholder="Bahrain International Airport" />
            </Field>
            <Field label="Drop-off location" error={errors.dropoffLocation}>
              <Input name="dropoffLocation" />
            </Field>
          </FormGrid>
        </Card>
      );

    case 'GROUP_ADVENTURE':
      return (
        <Card title="Group Adventure" description="Seats are held the moment you save.">
          <FormGrid>
            <Field label="Departure" required error={errors.departureId}>
              <Select
                name="departureId"
                value={departureId}
                onChange={(event) => {
                  setDepartureId(event.target.value);
                  const departure = departures.find((d) => d.id === event.target.value);
                  if (departure) {
                    const perSeat = Number.parseFloat(departure.pricePerSeat) || 0;
                    onPriceFromDeparture(
                      (perSeat * (Number.parseInt(seats, 10) || 1)).toFixed(3),
                    );
                  }
                }}
              >
                <option value="">— Choose a departure —</option>
                {departures.map((departure) => (
                  <option key={departure.id} value={departure.id}>
                    {departure.name} · {departure.departureDate} (
                    {departure.capacity - departure.seatsBooked} left)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Seats" required error={errors.seats}>
              <Input
                name="seats"
                inputMode="numeric"
                value={seats}
                onChange={(event) => {
                  setSeats(event.target.value);
                  if (selectedDeparture) {
                    const perSeat = Number.parseFloat(selectedDeparture.pricePerSeat) || 0;
                    onPriceFromDeparture(
                      (perSeat * (Number.parseInt(event.target.value, 10) || 0)).toFixed(3),
                    );
                  }
                }}
              />
            </Field>

            <Field
              label="Single supplement seats"
              hint="How many of those seats are in a single room."
              error={errors.singleSupplementSeats}
            >
              <Input name="singleSupplementSeats" inputMode="numeric" defaultValue="0" />
            </Field>
          </FormGrid>

          {selectedDeparture ? (
            <div className="mt-4">
              {overCapacity ? (
                <Alert tone="danger" title="Not enough seats">
                  {seatsRemaining === 0
                    ? 'This departure is full. Add the customer to the waitlist from the departure page.'
                    : `Only ${seatsRemaining} seat${seatsRemaining === 1 ? '' : 's'} remain.`}
                </Alert>
              ) : (
                <p className="text-sm text-slate-600">
                  <Badge tone="success">{seatsRemaining} seats left</Badge>{' '}
                  <span className="ml-2 tabular-nums">
                    {selectedDeparture.pricePerSeat} BHD per seat
                  </span>
                </p>
              )}
            </div>
          ) : null}
        </Card>
      );

    case 'PACKAGE':
      return (
        <PackagePanel
          components={packageComponents}
          setComponents={setPackageComponents}
          canSeeCost={canSeeCost}
        />
      );
  }
}

/**
 * A package bundles flight, hotel, transport and activities under one
 * customer-facing price. Each component keeps its own internal cost so
 * margin is still tracked, but the customer only ever sees the one selling
 * price on the Pricing card.
 */
function PackagePanel({
  components,
  setComponents,
  canSeeCost,
}: {
  components: PackageComponentRow[];
  setComponents: (update: (rows: PackageComponentRow[]) => PackageComponentRow[]) => void;
  canSeeCost: boolean;
}) {
  function addRow() {
    setComponents((rows) => [...rows, { kind: 'FLIGHT', description: '', costAmount: '0' }]);
  }
  function removeRow(index: number) {
    setComponents((rows) => rows.filter((_, i) => i !== index));
  }
  function updateRow(index: number, patch: Partial<PackageComponentRow>) {
    setComponents((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <Card
      title="Package components"
      description="Flight, hotel, transport, activities — whatever this package bundles. The customer sees only the fixed selling price on the right."
    >
      {components.length === 0 ? (
        <p className="text-sm text-slate-500">No components added yet.</p>
      ) : (
        <div className="space-y-3">
          {components.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[8rem_1fr_8rem_auto]"
            >
              <Select
                value={row.kind}
                onChange={(e) =>
                  updateRow(index, { kind: e.target.value as PackageComponentRow['kind'] })
                }
                aria-label="Component type"
              >
                {PACKAGE_COMPONENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.charAt(0) + kind.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
              <Input
                value={row.description}
                onChange={(e) => updateRow(index, { description: e.target.value })}
                placeholder="BAH–DXB return, Emirates"
                aria-label="Component description"
              />
              {canSeeCost ? (
                <Input
                  inputMode="decimal"
                  value={row.costAmount}
                  onChange={(e) => updateRow(index, { costAmount: e.target.value })}
                  placeholder="Cost (BHD)"
                  aria-label="Component cost"
                />
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="rounded-md border border-slate-300 px-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-voya-700 hover:bg-slate-50"
      >
        + Add component
      </button>
    </Card>
  );
}
