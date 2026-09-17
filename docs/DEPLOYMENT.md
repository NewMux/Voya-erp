# Deployment — Hetzner + Coolify

This app is built to run self-hosted: a multi-stage Docker image on top of a
Postgres 16 database, deployed through Coolify on a Hetzner VPS. No Vercel,
no Supabase.

> **Note on verification.** This session built and validated every piece —
> `next build`, `prisma generate`/`migrate`, the standalone output, the
> entrypoint script — individually and repeatedly, against a real Postgres.
> It could **not** run `docker build` itself: the sandbox this was developed
> in has no usable Docker daemon (nested-container restriction). Treat the
> first `docker build` on your Hetzner box as the first real end-to-end test
> of the image, and see **Troubleshooting** below if it doesn't come up clean.

## What's in the image

`Dockerfile` is a three-stage build:

1. **deps** — `npm ci` once, cached across builds.
2. **builder** — `npm run build`, which is `prisma generate && next build`.
   `next.config.ts` sets `output: 'standalone'`, so the build produces a
   self-contained server bundle that does not need `node_modules` at runtime.
3. **runner** — copies only the standalone bundle, the compiled Prisma
   client (with its query-engine binary), the `prisma/` directory (schema +
   migrations + seed), and the full `prisma`/`@prisma` CLI packages from the
   builder stage. The CLI is needed because `docker-entrypoint.sh` runs
   `prisma migrate deploy` before the server starts — the standalone tracer
   only bundles what `@prisma/client` needs at runtime, not the separate CLI
   binaries `migrate deploy` uses, so those are copied explicitly.

Runs as an unprivileged user (`nextjs`), exposes `3000`, and has a
`HEALTHCHECK` against `/api/health`.

`.dockerignore` keeps `.env*`, `node_modules`, `.next` and `.git` out of the
build context. This matters beyond image size: Next's standalone output
copies any `.env*` file it finds into the bundle it produces (so `next start`
can load it), which means a stray local `.env` in the build context would
otherwise get baked into the shipped image layer.

## 1. Provision the Hetzner box

Any size that runs Coolify comfortably (2 vCPU / 4 GB is plenty for this
app). Follow Coolify's own install instructions — a single `curl | bash`
against a fresh Ubuntu server, then open the Coolify UI it prints.

## 2. Add the Postgres database

In Coolify: **New Resource → Database → PostgreSQL 16**. Note the internal
connection string Coolify gives you (something like
`postgresql://user:pass@postgres-service:5432/voya_erp`) — that is your
`DATABASE_URL`.

There is no `SHADOW_DATABASE_URL` needed in production; that variable is
only read by `prisma migrate dev` for local development.

## 3. Add the application

**New Resource → Application → Docker → From a Git repository**, pointing at
this repo's `main` (or the branch you deploy from). Coolify will build the
`Dockerfile` at the repo root directly — no build pack needed.

### Environment variables

Copy `.env.example` as your checklist. In Coolify's environment tab for the
application:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The internal connection string from step 2 |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://` + your domain |
| `AUTH_TRUST_HOST` | `true` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `STORAGE_DRIVER` | `local` |
| `STORAGE_LOCAL_PATH` | `./storage/uploads` |
| `WHATSAPP_PROVIDER` | `manual` until Meta credentials are ready, then `meta` |
| `RUN_SEED_ON_START` | `true` for the first deploy (see below) |

Everything else in `.env.example` has a sensible default and can be left
unset until it's actually needed (WhatsApp Cloud API credentials, reminder
timing, etc.) — see `docs/WHATSAPP.md`.

### Persistent volume

Attachments (ticket PDFs, hotel vouchers, visa copies) live on disk at
`STORAGE_LOCAL_PATH`. **Mount a Coolify persistent volume at
`/app/storage`**, or every redeploy discards uploaded files. The Dockerfile
already declares `VOLUME ["/app/storage"]`; Coolify's volume UI just needs to
target that same path.

### First deploy: seed reference data

`docker-entrypoint.sh` always runs `prisma migrate deploy` before the server
starts — that part is unconditional and safe to run on every boot, since it
only applies migrations already committed to the repo.

Reference data (the three staff logins, the WhatsApp message templates, the
company settings for the invoice PDF) is separate and gated behind
`RUN_SEED_ON_START=true`, because it should not run on every restart. Set it
to `true` for the **first** deploy, confirm the app is up, then set it back
to `false` (or remove it) for subsequent deploys. Every write it makes is an
upsert that preserves existing values, so leaving it `true` longer than
necessary is not destructive — it just re-runs work that has no effect the
second time — but there is no reason to pay that cost on every restart.

The default staff password is `ChangeMe123!` unless you set `SEED_PASSWORD`
in the environment before the first deploy. **Change it immediately after
first login** — there's no forced-reset flow in Phase 1, so this is a manual
step. The three accounts:

```
admin@voyatravel.bh     (ADMIN)
accounts@voyatravel.bh  (ACCOUNTANT)
staff@voyatravel.bh     (STAFF)
```

### Domain and TLS

Point your domain's A record at the Hetzner box, add it in Coolify's
application settings, and Coolify provisions a Let's Encrypt certificate
automatically.

## 4. Wire the WhatsApp scheduled task

Add a Coolify **Scheduled Task** on the application, running every 5–15
minutes:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/notifications
```

See `docs/WHATSAPP.md` for what this does and how to move from the manual
`wa.me` fallback to the Meta Cloud API once business verification is
complete.

## 5. Verify the deployment

```bash
# The container is healthy and can reach the database.
curl https://<your-domain>/api/health
# {"status":"ok","database":"up","time":"..."}

# Sign in as admin@voyatravel.bh, change the password, then:
# - create a customer and issue a membership (VY-0000001)
# - create a Group Adventure departure and book a seat
# - create an invoice and download the PDF in English, Arabic and bilingual
# - confirm a booking, then run the cron command above and check
#   /notifications for the queued message
```

## Redeploying

Push to the branch Coolify watches, or trigger a redeploy from the Coolify
UI. `prisma migrate deploy` runs automatically on container start, so a
redeploy that includes new migrations applies them before the new version
starts serving traffic. Leave `RUN_SEED_ON_START` unset/`false` for routine
redeploys.

## Local development

```bash
docker compose up -d db          # Postgres 16 + the shadow and test databases
cp .env.example .env              # then fill in AUTH_SECRET / CRON_SECRET
npx prisma migrate dev
npm run seed                      # add SEED_DEMO=true for sample data
npm run dev
```

Running the full stack (app included) locally via Docker:

```bash
docker compose --profile full up --build
```

## Troubleshooting a first deploy

These are the failure points worth checking first, precisely because this
image's build was validated stage-by-stage rather than as one continuous
`docker build` (see the note at the top of this document):

- **Container exits immediately, logs show a Prisma engine error.** The
  `runner` stage is `node:22-alpine` (musl libc). Prisma's query engine is
  platform-specific and is generated fresh inside the `builder` stage during
  `npm run build`, which also runs on `node:22-alpine` — so it should already
  produce the musl binary. If this still fails, add `binaryTargets` to the
  `generator client` block in `prisma/schema.prisma` (e.g.
  `["native", "linux-musl-openssl-3.0.x"]`) to force it.
- **`prisma migrate deploy` can't find its engine.** This would show up as
  the container failing at the "Applying database migrations..." log line.
  The fix is already in the Dockerfile (copying the full `node_modules/prisma`
  and `node_modules/@prisma` from the builder stage, not just what the
  standalone tracer bundled) — if it still happens, check that step actually
  copied files by shelling into the running container
  (`docker exec -it <container> sh`) and checking
  `ls node_modules/@prisma`.
- **`/api/health` reports `database: "down"`.** Check `DATABASE_URL` points
  at the *internal* Coolify service address, not a public one, and that the
  Postgres resource is in the same Coolify project/network.
- **Uploaded attachments disappear after a redeploy.** The persistent volume
  isn't mounted at `/app/storage` — see the volume step above.
