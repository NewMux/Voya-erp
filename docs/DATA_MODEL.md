# Data model

The single source of truth is `prisma/schema.prisma`. This document is a map
of it — why the shape is what it is — not a duplicate of the field list.

## Conventions

- **Money is `Decimal(18, 3)`, never `Float`.** BHD has three decimal places
  (1 BHD = 1000 fils); a two-decimal assumption would silently truncate every
  Bahraini amount. Other currencies are stored at the same scale and rounded
  through `src/lib/money.ts`, which is the only place that should touch a
  `Decimal`.
- **FX rates are `Decimal(18, 6)`** and are snapshotted onto the row that used
  them (`Booking.fxRate`, `PackageComponent.fxRate`, `SupplierInvoice.fxRate`).
  The PRD requires conversion "at entry-time rate", so nothing re-derives a
  historical amount from a current rate.
- **Reference numbers come from Postgres sequences**, not `count() + 1`, which
  races under concurrent writes. See `prisma/migrations/20260917043000_reference_sequences`
  and `src/server/services/reference.service.ts`.
- **Derived status columns are never set directly.** `Booking.paymentStatus`,
  `Invoice.status`, `PaymentScheduleItem.status` and `SupplierInvoice.status`
  are all recalculated from the rows beneath them by
  `src/server/services/payment.service.ts` inside the same transaction as
  every write that could change them.
- **`createdById` / `recordedById` columns exist now** so the Phase 2 audit
  trail has a foundation. No audit log table exists yet.

## Module map

| PRD section | Models |
|---|---|
| 1. Bookings | `Booking`, `FlightDetail`, `HotelDetail`, `VisaDetail`, `TransportDetail`, `PackageComponent`, `GroupAdventureDetail`, `Traveler`, `BookingAttachment`, `PaymentScheduleItem` |
| 1.4 Group Adventure | `GroupTripTemplate`, `GroupItineraryDay`, `GroupDeparture`, `GroupWaitlistEntry` |
| 2. Customers | `Customer` |
| 3. Suppliers | `Supplier`, `SupplierRateSheet`, `SupplierInvoice`, `SupplierInvoiceBooking` |
| 4. Finance | `Invoice`, `InvoiceLine`, `Payment`, `PaymentAllocation`, `Refund` |
| 5. Membership | `Membership`, `MembershipRenewal` |
| 6. WhatsApp | `NotificationTemplate`, `NotificationOutbox` |
| Auth | `User`, `Session` |
| Settings | `AppSetting`, `ExchangeRate` |

## Why one-to-one detail tables, not one wide `Booking`

A flight needs a PNR and a route; a hotel needs check-in/out and board basis;
neither needs the other's fields. Six booking types sharing every column would
mean forty-plus nullable columns on `Booking`, none of them actually
required. Instead `Booking` carries what every type shares (customer,
supplier, dates, pax, cost/selling/margin, status), and each type has its own
`@id`-linked detail table (`FlightDetail`, `HotelDetail`, …) created in the
same transaction as the booking. `PACKAGE` bookings use `PackageComponent[]`
instead of a single detail row, since a package bundles several components
under one price.

## Payment plan: rows, not columns

The PRD's payment plan ("deposit % or amount, balance with a due date") is
modelled as `PaymentScheduleItem` rows (`DEPOSIT` / `BALANCE` /
`INSTALLMENT`) rather than four columns on `Booking`. This is what makes:

- the balance-due reminder query a plain `WHERE dueDate <= ... AND status IN (...)` scan instead of hand-rolled date logic;
- a future multi-instalment plan a data change, not a migration;
- the waterfall in `recalcScheduleItems` possible: an unassigned payment
  applies to the lowest `sequence` first (deposit before balance), *not* the
  earliest `dueDate` — a rescheduled balance must never jump the deposit in
  the queue.

`PaymentAllocation` is the join between a `Payment` and the `Booking`(s) it
settles, because one payment can be received against an invoice that bundles
several bookings, and needs to be split across them.

## Group Adventure: templates vs. departures

A `GroupTripTemplate` holds the reusable itinerary. Creating a
`GroupDeparture` from it **copies** the `GroupItineraryDay` rows onto the
departure rather than referencing the template's rows. Editing a template
after a departure has been sold must never rewrite the itinerary customers
were shown — the copy is what guarantees that.

Seat capacity is enforced with `SELECT ... FOR UPDATE` on the
`GroupDeparture` row inside the booking transaction
(`src/server/services/booking.service.ts::reserveSeats`), not an application-
level check-then-write, which would let two concurrent bookings both read
"1 seat left" and both succeed.

## Membership: snapshotted, not looked up

`Membership.discountPercent` and `groupBookingPriority` are the *current*
terms. When a booking is created, `activeBenefitFor()` resolves the benefit
that applies *right now* and the discount percentage and amount are written
onto the `Booking` row itself
(`membershipDiscountPercent` / `membershipDiscountAmount`). If the member's
tier or discount changes next month, historical bookings must not change
retroactively — the snapshot is what prevents that.

## Numbering

Three sequences, each with its own prefix and reset behaviour:

| Sequence | Format | Resets |
|---|---|---|
| `membership_number_seq` | `VY-0000001` | Never — a member keeps their number for life |
| `booking_reference_seq` | `VB-2026-000001` | Each calendar year |
| `invoice_number_seq` | `VOY-2026-000001` | Each calendar year |

The year-scoped sequences go through `next_yearly_reference()`, a Postgres
function created in the same migration, which takes an advisory lock before
checking whether the year has rolled over — without it, two calls on
1 January could both observe "year changed" and both restart the sequence,
producing a duplicate `-000001`.

## Running migrations

```bash
npx prisma migrate dev     # local development: creates + applies + regenerates the client
npx prisma migrate deploy  # production: applies only what is committed, never generates
```

`prisma/seed.ts` (dev) and `prisma/seed-reference.mjs` (production container)
both call the shared `prisma/reference-data.mjs` module for staff logins,
WhatsApp templates and company settings — every write there is an `upsert`
that preserves an existing value, so re-running it never resets a changed
password or overwrites reworded template text. Demo data (a sample customer,
supplier and departure) is created only when `SEED_DEMO=true`, and only by
the TypeScript dev seed — the production path never creates it.
