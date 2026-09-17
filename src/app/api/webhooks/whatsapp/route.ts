import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

/**
 * Meta Cloud API delivery receipts.
 *
 * Meta verifies the endpoint once with a GET challenge, then POSTs status
 * updates. Every POST is signature-checked against the app secret, because this
 * route is necessarily public and anything else would let a stranger rewrite
 * delivery history.
 */

export const dynamic = 'force-dynamic';

/** Meta's one-time subscription handshake. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const expected = env().WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/** Verify X-Hub-Signature-256 over the exact raw body. */
function signatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = header.slice('sha256='.length);

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

const DELIVERY_STATUS = {
  sent: 'ACCEPTED',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
} as const;

type MetaStatus = {
  id?: string;
  status?: keyof typeof DELIVERY_STATUS;
  errors?: Array<{ title?: string; message?: string }>;
};

export async function POST(request: Request) {
  const appSecret = env().WHATSAPP_APP_SECRET;

  // Reading the body as text first is deliberate: the signature covers the
  // exact bytes, and re-serialising parsed JSON would not reproduce them.
  const rawBody = await request.text();

  if (!appSecret) {
    console.warn('WhatsApp webhook received but WHATSAPP_APP_SECRET is not set; ignoring.');
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!signatureValid(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: {
    entry?: Array<{ changes?: Array<{ value?: { statuses?: MetaStatus[] } }> }>;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const statuses =
    payload.entry?.flatMap(
      (entry) => entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? [],
    ) ?? [];

  let updated = 0;

  for (const status of statuses) {
    if (!status.id || !status.status) continue;

    const deliveryStatus = DELIVERY_STATUS[status.status];
    if (!deliveryStatus) continue;

    const error = status.errors?.[0];

    // updateMany rather than update: a receipt for a message we do not hold
    // must be ignored, not throw.
    const result = await prisma.notificationOutbox.updateMany({
      where: { providerMessageId: status.id },
      data: {
        deliveryStatus,
        ...(deliveryStatus === 'FAILED'
          ? { lastError: error?.message ?? error?.title ?? 'Delivery failed' }
          : {}),
      },
    });

    updated += result.count;
  }

  // Always 200 on a valid signature: a non-2xx makes Meta retry the whole
  // batch, including the receipts already applied.
  return NextResponse.json({ ok: true, updated });
}
