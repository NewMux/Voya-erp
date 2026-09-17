import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Health check for the Coolify container.
 *
 * Checks the database too, not just that the process is up: a container that
 * cannot reach Postgres should not be marked healthy and sent traffic.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { status: 'error', database: 'down', time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
