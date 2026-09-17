/**
 * Render sample invoices in all three languages, for eyeballing the template.
 *
 *   npx tsx scripts/pdf-preview.ts [outDir]
 *
 * Writes invoice-en.pdf, invoice-ar.pdf and invoice-bilingual.pdf.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderInvoicePdf, type InvoicePdfData } from '../src/server/pdf/invoice-pdf';

const sample: Omit<InvoicePdfData, 'language'> = {
  number: 'VOY-2026-000031',
  issueDate: new Date('2026-09-17'),
  dueDate: new Date('2026-10-01'),
  status: 'PARTIALLY_PAID',
  currency: 'BHD',
  subtotal: '1425.500',
  discountTotal: '142.550',
  total: '1282.950',
  paidAmount: '400.000',
  balance: '882.950',
  notes: 'Balance due 45 days before travel. Passport copies required for all travellers.',
  notesAr: 'المبلغ المتبقي مستحق قبل ٤٥ يوماً من السفر. يُرجى تزويدنا بنسخ جوازات السفر لجميع المسافرين.',
  terms: 'Payment is due by the date shown above. Bank transfer and Benefit Pay accepted.',
  customer: {
    fullName: 'Ahmed Al Khalifa',
    companyName: null,
    crNumber: null,
    phone: '+973 3300 1122',
    email: 'ahmed@example.bh',
    membershipNumber: 'VY-0001042',
  },
  lines: [
    {
      description: 'VB-2026-000118 — Flight BAH to TBS, Gulf Air',
      descriptionAr: 'رحلة من البحرين إلى تبليسي، طيران الخليج',
      quantity: '2.00',
      unitPrice: '285.000',
      lineTotal: '570.000',
    },
    {
      description: 'VB-2026-000119 — Tbilisi Grand Hotel, 4 nights, BB',
      descriptionAr: 'فندق تبليسي الكبير، ٤ ليالٍ، مع الإفطار',
      quantity: '4.00',
      unitPrice: '155.500',
      lineTotal: '622.000',
    },
    {
      description: 'VB-2026-000120 — Airport transfer, sedan',
      descriptionAr: 'توصيل من وإلى المطار، سيارة سيدان',
      quantity: '1.00',
      unitPrice: '233.500',
      lineTotal: '233.500',
    },
  ],
  company: {
    'company.name': 'Voya Travel & Tourism',
    'company.nameAr': 'فويا للسفر والسياحة',
    'company.address': "Ramli Petrol Station, Office 345, A'ali, Bahrain",
    'company.phone': '+973 0000 0000',
    'company.email': 'info@voyatravel.bh',
    'company.instagram': '@voyatravelbh',
  },
};

async function main() {
  const outDir = process.argv[2] ?? join(process.cwd(), 'tmp-pdf');
  await mkdir(outDir, { recursive: true });

  for (const language of ['EN', 'AR', 'BILINGUAL'] as const) {
    const buffer = await renderInvoicePdf({ ...sample, language });
    const path = join(outDir, `invoice-${language.toLowerCase()}.pdf`);
    await writeFile(path, buffer);
    console.log(`${language.padEnd(9)} ${(buffer.byteLength / 1024).toFixed(1)} KB  ${path}`);
  }
}

main().catch((error) => {
  console.error('PDF preview failed:', error);
  process.exitCode = 1;
});
