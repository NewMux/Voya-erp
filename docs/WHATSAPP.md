# WhatsApp notifications

PRD section 6. Moved into Phase 1 at the client's request, limited to the
four events that Phase 1 data already supports.

## The four events

| Event | Trigger | Recipient |
|---|---|---|
| `BOOKING_CONFIRMED` | Booking status → `CONFIRMED` | Customer |
| `BALANCE_DUE_REMINDER` | `REMINDER_BALANCE_DAYS_BEFORE` days before a `BALANCE` schedule item's due date | Customer |
| `MEMBERSHIP_RENEWAL_REMINDER` | `REMINDER_MEMBERSHIP_DAYS_BEFORE` days before membership expiry | Customer |
| `GROUP_CAPACITY_ALERT` | A departure crosses `GROUP_CAPACITY_ALERT_THRESHOLD`% or fills completely | Staff (`WHATSAPP_STAFF_NUMBERS`) |

Passport/visa-linked notifications (e.g. "your visa is ready") stay out —
that tracking is a Phase 2 feature, so there is nothing yet to notify from.

## Why enqueue and dispatch are separate

`src/server/services/notification.service.ts` only ever **writes a row** to
`NotificationOutbox`. Nothing is sent from a request handler. This means:

- A WhatsApp outage cannot fail a booking, a payment, or a status change —
  the write that triggers the notification always succeeds independently of
  whether the message can currently be delivered.
- Retrying is just re-running the dispatcher; nothing about the booking flow
  needs to know a message failed.

`src/server/services/dispatch.service.ts::runNotificationCron` is the
scheduled job, in two phases:

1. **Enqueue** (`enqueueDueNotifications`) — sweeps for what has come due
   (lapsed memberships, overdue invoices, balance reminders, renewal
   reminders) and writes outbox rows.
2. **Dispatch** (`dispatchPending`) — claims pending rows and hands them to
   the active provider.

## Idempotency

Every outbox row has a unique `dedupeKey`, built from
`(event, entity id, occurrence)` — e.g.
`balance_due:<scheduleItemId>:<dueDate>`. Enqueueing on a `dedupeKey` that
already exists is a no-op. This is what makes it safe to call
`/api/cron/notifications` as often as you like: a customer whose balance is
still due tomorrow is not reminded twice for today, but a balance
*rescheduled* to a new date correctly gets one further reminder — the date is
part of the key.

Dispatch claims a row with a conditional `updateMany` (`WHERE status =
'PENDING'`) before sending, so two overlapping cron runs cannot both send the
same message.

## Providers

One interface, `src/server/providers/whatsapp/types.ts`, two
implementations, selected by `WHATSAPP_PROVIDER`:

### `manual` (default)

Sends nothing. Every message stays `PENDING` and appears on the
**Notifications** screen with a pre-filled `wa.me` link. A staff member opens
the link, WhatsApp opens with the message ready to send, they press send in
WhatsApp, then click **Mark sent** in the app.

This is what makes the feature usable from day one — before Meta business
verification and template approval, which typically take days to weeks and
are outside Newmux's control.

### `meta`

The WhatsApp Cloud API. Requires:

```
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=<from the Meta developer console>
WHATSAPP_ACCESS_TOKEN=<a permanent system-user token, not the 24h token>
WHATSAPP_API_VERSION=v21.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<a string you choose, used once during setup>
WHATSAPP_APP_SECRET=<from the Meta app's Basic Settings>
```

Every message here is business-initiated outside any customer-service
window, so Meta requires a **pre-approved message template** — free-form text
is rejected. `NotificationTemplate.metaTemplateName` maps each event to its
approved template name, and `variables` (an ordered array) decides which
value fills `{{1}}`, `{{2}}`, … — the order must match how the template was
submitted for approval in Meta Business Manager.

Failures are split into retryable (429, 5xx, network/timeout) and permanent
(4xx, no template mapped). Retryable failures back off exponentially (capped
at 60 minutes) and give up after 5 attempts, landing in `FAILED` for a human
to look at on the Notifications screen.

### Switching providers

Nothing else changes. The outbox, the templates, the dedupe key, the
dashboard counters — all identical. Set `WHATSAPP_PROVIDER=meta` with valid
credentials and the next cron run starts sending through the Cloud API
instead of queuing for manual send.

## Delivery receipts

`/api/webhooks/whatsapp` receives Meta's delivery status callbacks
(`sent` / `delivered` / `read` / `failed`) and updates
`NotificationOutbox.deliveryStatus`. Two things worth knowing:

- Every POST is checked against `X-Hub-Signature-256`, computed from
  `WHATSAPP_APP_SECRET` over the **raw** request body — parsing the JSON and
  re-serialising it would not reproduce the bytes Meta signed.
- The route always answers `200` once the signature is valid, even if a
  particular `id` in the payload matches no row here. A non-2xx makes Meta
  retry the *entire batch*, including receipts already applied.

Set up the webhook once in the Meta developer console, pointing at
`https://<your-domain>/api/webhooks/whatsapp`, using
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` for the one-time GET verification challenge.

## Reminder timing and thresholds

Configurable via environment, with sensible defaults:

```
REMINDER_BALANCE_DAYS_BEFORE=7        # PRD example was 45 days before travel — set per business preference
REMINDER_MEMBERSHIP_DAYS_BEFORE=30
GROUP_CAPACITY_ALERT_THRESHOLD=80     # percent
```

## Wiring the scheduled task (Coolify)

Add a scheduled task/cron resource pointing at:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/notifications
```

Every 5–15 minutes is reasonable. Running it more often only means messages
that come due are sent sooner; it is always safe to run concurrently with
itself thanks to the claiming update above.

## Rewording a template

Message bodies live in `NotificationTemplate.bodyEn` / `bodyAr`, not in code.
Edit them directly in the database (a Settings screen for this is a natural
Phase 2 addition) — the seed's `upsert` never overwrites a template someone
has already customised, only its `event`, `name` and `variables`.
