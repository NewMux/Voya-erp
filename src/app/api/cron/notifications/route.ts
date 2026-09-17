import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runNotificationCron } from '@/server/services/dispatch.service';

/**
 * Scheduled notification run.
 *
 * Wired to a Coolify scheduled task:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://erp.voyatravel.bh/api/cron/notifications
 *
 * Safe to call as often as you like: the enqueue phase deduplicates on a key
 * per (event, entity, occurrence), and the dispatch phase claims each row
 * before sending.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Constant-time comparison, so the secret cannot be guessed a byte at a time. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorise(request: Request): boolean {
  const expected = env().CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (bearer && secretMatches(bearer, expected)) return true;

  // Some schedulers cannot set headers; accept a query parameter as a fallback.
  const fromQuery = new URL(request.url).searchParams.get('secret') ?? '';
  return Boolean(fromQuery) && secretMatches(fromQuery, expected);
}

async function handle(request: Request) {
  if (!authorise(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const result = await runNotificationCron();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    console.error('Notification cron failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
