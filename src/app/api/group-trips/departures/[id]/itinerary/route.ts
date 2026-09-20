import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/server/guards';
import { departureRoster } from '@/server/services/group.service';
import { renderItineraryPdf } from '@/server/pdf/itinerary-pdf';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const { id } = await params;

  const [departure, roster, settings] = await Promise.all([
    prisma.groupDeparture.findUnique({
      where: { id },
      include: { itineraryDays: { orderBy: { dayNumber: 'asc' } } },
    }),
    departureRoster(id),
    prisma.appSetting.findMany(),
  ]);

  if (!departure) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const company = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));

  const pdf = await renderItineraryPdf({
    tripName: departure.name,
    destination: departure.destination,
    departureDate: departure.departureDate,
    returnDate: departure.returnDate,
    tourLeaderName: departure.tourLeaderName,
    itineraryDays: departure.itineraryDays,
    roster: roster.map((row) => ({
      fullName: row.fullName,
      type: row.type,
      passportNumber: row.passportNumber,
    })),
    company,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${departure.name.replace(/[^\w.-]+/g, '_')}-itinerary.pdf"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
