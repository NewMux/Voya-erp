import { NextResponse } from 'next/server';
import type { InvoiceLanguage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/server/guards';
import { renderInvoicePdf } from '@/server/pdf/invoice-pdf';
import { subtract, toStorage, type CurrencyCode } from '@/lib/money';

/**
 * Invoice PDF.
 *
 * `?lang=` overrides the invoice's stored language so staff can preview the
 * bilingual toggle without changing the record.
 */

export const dynamic = 'force-dynamic';

const LANGUAGES: InvoiceLanguage[] = ['EN', 'AR', 'BILINGUAL'];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const { id } = await params;

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: { include: { membership: { select: { membershipNumber: true } } } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    }),
    prisma.appSetting.findMany(),
  ]);

  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const requested = new URL(request.url).searchParams.get('lang')?.toUpperCase();
  const language = LANGUAGES.includes(requested as InvoiceLanguage)
    ? (requested as InvoiceLanguage)
    : invoice.language;

  const company = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));

  const pdf = await renderInvoicePdf({
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    language,
    currency: invoice.currency as CurrencyCode,
    subtotal: invoice.subtotal.toString(),
    discountTotal: invoice.discountTotal.toString(),
    total: invoice.total.toString(),
    paidAmount: invoice.paidAmount.toString(),
    balance: toStorage(subtract(invoice.total, invoice.paidAmount)),
    notes: invoice.notes,
    notesAr: invoice.notesAr,
    terms: invoice.terms ?? company['invoice.terms'] ?? null,
    customer: {
      fullName: invoice.customer.fullName,
      companyName: invoice.customer.companyName,
      crNumber: invoice.customer.crNumber,
      phone: invoice.customer.phone,
      email: invoice.customer.email,
      membershipNumber: invoice.customer.membership?.membershipNumber ?? null,
    },
    lines: invoice.lines.map((line) => ({
      description: line.description,
      descriptionAr: line.descriptionAr,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      lineTotal: line.lineTotal.toString(),
    })),
    company,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.number}.pdf"`,
      'Content-Length': String(pdf.byteLength),
      // Regenerated on every request so it always reflects current payments.
      'Cache-Control': 'no-store',
    },
  });
}
