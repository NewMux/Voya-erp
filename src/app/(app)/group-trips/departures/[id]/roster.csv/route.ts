import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/server/guards';
import { departureRoster, rosterToCsv } from '@/server/services/group.service';

/**
 * Roster export for the tour leader (PRD section 1.4).
 *
 * CSV rather than a PDF: the tour leader needs to sort and annotate it, and it
 * opens on any phone. The service prefixes a BOM so Excel reads it as UTF-8 and
 * does not mangle Arabic names.
 */

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const { id } = await params;

  const departure = await prisma.groupDeparture.findUnique({
    where: { id },
    select: { name: true, departureDate: true },
  });
  if (!departure) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await departureRoster(id);
  const csv = rosterToCsv(rows);

  const slug = departure.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const date = departure.departureDate.toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="roster-${slug}-${date}.csv"`,
      // The roster contains passport numbers; never let a proxy cache it.
      'Cache-Control': 'no-store',
    },
  });
}
