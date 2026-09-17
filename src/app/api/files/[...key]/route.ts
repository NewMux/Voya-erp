import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/server/guards';
import { etagFor, storage } from '@/server/storage';

/**
 * Authenticated attachment download.
 *
 * Attachments include visa copies and passport scans, so they are never served
 * from a public path. Every request is checked against the session, and the key
 * must correspond to a real attachment row — a valid-looking key for a file
 * that no booking references is refused.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const { key } = await params;
  const fileKey = key.join('/');

  const [attachment, rateSheet] = await Promise.all([
    prisma.bookingAttachment.findUnique({ where: { fileKey } }),
    prisma.supplierRateSheet.findFirst({ where: { fileKey } }),
  ]);

  const record = attachment
    ? {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      }
    : rateSheet?.fileName
      ? {
          fileName: rateSheet.fileName,
          mimeType: rateSheet.fileMimeType ?? 'application/octet-stream',
          sizeBytes: 0,
        }
      : null;

  if (!record) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const etag = etagFor(fileKey, record.sizeBytes);
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304 });
  }

  try {
    const buffer = await storage().read(fileKey);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': record.mimeType,
        // `inline` so a PDF opens in the browser; the quoted filename keeps
        // spaces intact.
        'Content-Disposition': `inline; filename="${record.fileName.replace(/"/g, '')}"`,
        'Content-Length': String(buffer.byteLength),
        ETag: etag,
        // Private: these are per-customer documents, never shared caches.
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Attachment read failed:', error);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
