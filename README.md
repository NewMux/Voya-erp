# Voya ERP

The internal operating system for **Voya Travel & Tourism** (Bahrain) —
Phase 1: bookings, customers, suppliers, finance, membership and WhatsApp
notifications. Built by [Newmux](https://github.com/NewMux).

Full requirements: `Voya Travel & Tourism PRD — Phase 1` (the source
document this build was scoped against).

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Prisma 6 + PostgreSQL 16 ·
Tailwind v4 · Auth.js v5 · Vitest. Self-hosted on Hetzner via Coolify — no
Vercel, no Supabase.

## Modules

| Module | PRD section | Route |
|---|---|---|
| Bookings (all six types) | 1 | `/bookings` |
| Group Adventures | 1.4 | `/group-trips` |
| Customers (CRM) | 2 | `/customers` |
| Suppliers + reconciliation | 3 | `/suppliers` |
| Finance & invoicing (bilingual PDF) | 4 | `/invoices`, `/payments` |
| Membership | 5 | `/memberships` |
| WhatsApp notifications | 6 | `/notifications` |

Three roles: `ADMIN`, `ACCOUNTANT`, `STAFF`. Cost price, margin and customer
lifetime value are visible only to `ADMIN`/`ACCOUNTANT`, per the PRD.

## Quickstart

```bash
docker compose up -d db                 # Postgres 16 + shadow + test databases
cp .env.example .env                    # then fill in AUTH_SECRET and CRON_SECRET:
                                         #   openssl rand -base64 32
                                         #   openssl rand -hex 32
npm install
npx prisma migrate dev
npm run seed                            # add SEED_DEMO=true for sample data
npm run dev
```

Sign in at `http://localhost:3000` with `admin@voyatravel.bh` /
`ChangeMe123!` (or your own `SEED_PASSWORD`).

## Scripts

```bash
npm run dev / build / start   # Next.js
npm run lint                  # ESLint (flat config, eslint-config-next 16)
npm run typecheck             # tsc --noEmit
npm test                      # Vitest against TEST_DATABASE_URL — see below
npm run db:migrate            # prisma migrate dev
npm run db:studio             # Prisma Studio
npm run seed                  # reference data + optional demo data
```

`npx tsx scripts/acceptance.ts` drives the PRD's headline path end to end
against the dev database (membership discount, deposit/balance, seat
locking, notification queueing, cancellation) and prints what it produced —
useful as a smoke test after a schema or service change.

## Tests

The suite runs against a **real** Postgres — sequence allocation, row
locking (`SELECT ... FOR UPDATE` for Group Adventure seats) and transaction
rollback have no meaningful in-memory equivalent, so mocking the database
would test the mock, not the behaviour that matters.

It truncates every table between test files, so it refuses to run unless
`TEST_DATABASE_URL` is set to a database that is **not** `DATABASE_URL` —
`docker-compose.yml` already provisions one (`voya_erp_test`) alongside the
dev database.

## Documentation

- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — the schema and the reasoning
  behind it (money as `Decimal`, sequence-based numbering, why templates and
  departures are separate, why the payment plan is rows not columns).
- [`docs/WHATSAPP.md`](docs/WHATSAPP.md) — the notification outbox, the two
  provider adapters (manual `wa.me` fallback vs. the Meta Cloud API), and how
  to switch between them.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Hetzner + Coolify, step by
  step, plus first-deploy troubleshooting.

## Explicitly out of scope for Phase 1

Per the PRD, deferred to Phase 2:

- HR / permissions module (Phase 1 ships three fixed roles, not a
  configurable permission system)
- Proactive passport & visa expiry tracking (the fields exist on `Customer`
  and are shown on the booking screen, but nothing alerts on them yet)
- Advanced dashboard / reporting suite (the current dashboard is deliberately
  a small set of "what needs attention today" counters)
- VAT
- Audit trail (`createdById` / `recordedById` columns exist as a foundation,
  but there is no audit log table)

Also out of scope entirely: physical membership card design and printing —
this system covers only the membership number, discount and priority logic
behind it.

**Open items noted in the PRD, not yet scoped:** cancellation/refund policy
automation and hotel rooming-list generation (tentatively Phase 2), and
passport data handling under Bahrain's PDPL — passport fields live on a
single table (`Customer.passportNumber` / `passportExpiry`) with no
encryption-at-rest or retention policy applied yet, pending that business
decision.
