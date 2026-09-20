import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/server/guards';
import { renderPartnerOffersPdf } from '@/server/pdf/partner-offers-pdf';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const [offers, settings] = await Promise.all([
    prisma.partnerOffer.findMany({
      where: { isActive: true, agreementEnd: { gte: new Date() } },
      orderBy: { name: 'asc' },
    }),
    prisma.appSetting.findMany(),
  ]);

  const company = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));

  const pdf = await renderPartnerOffersPdf({
    offers: offers.map((offer) => ({
      name: offer.name,
      country: offer.country,
      description: offer.description,
      termsAndConditions: offer.termsAndConditions,
      agreementEnd: offer.agreementEnd,
    })),
    company,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="voya-partner-offers-directory.pdf"',
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
