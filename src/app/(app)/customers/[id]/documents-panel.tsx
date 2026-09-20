'use client';

import { useActionState } from 'react';
import type { AttachmentKind } from '@prisma/client';
import {
  deleteCustomerAttachment,
  uploadCustomerAttachment,
} from '@/server/actions/customer.actions';
import { Card, Field, Select } from '@/components/ui';
import { ConfirmButton, FormGrid, FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';

const DOCUMENT_LABELS: Record<'PASSPORT_COPY' | 'VISA_COPY' | 'PHOTO' | 'OTHER', string> = {
  PASSPORT_COPY: 'Passport copy',
  VISA_COPY: 'Visa copy',
  PHOTO: 'Personal photo',
  OTHER: 'Other',
};

/** Documents on the customer's own profile — not tied to any one booking. */
export function DocumentsPanel({
  customerId,
  attachments,
}: {
  customerId: string;
  attachments: Array<{
    id: string;
    kind: AttachmentKind;
    fileKey: string;
    fileName: string;
    sizeBytes: number;
  }>;
}) {
  const [uploadState, uploadAction] = useActionState(uploadCustomerAttachment, idleState);
  const [deleteState, deleteAction] = useActionState(deleteCustomerAttachment, idleState);

  return (
    <Card title="Documents" description="Passport copy, visa copy, photo and other files.">
      <FormMessage state={deleteState} />

      {attachments.length > 0 ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <a
                  href={`/api/files/${attachment.fileKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-voya-800 hover:underline"
                >
                  {attachment.fileName}
                </a>
                <p className="text-xs text-slate-500">
                  {DOCUMENT_LABELS[attachment.kind as keyof typeof DOCUMENT_LABELS] ?? attachment.kind} ·{' '}
                  {(attachment.sizeBytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <form action={deleteAction}>
                <input type="hidden" name="attachmentId" value={attachment.id} />
                <ConfirmButton variant="ghost" size="sm" confirmText="Remove this document?">
                  Remove
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">No documents uploaded yet.</p>
      )}

      <form action={uploadAction} className="border-t border-slate-100 pt-4">
        <FormMessage state={uploadState} />
        <input type="hidden" name="customerId" value={customerId} />

        <FormGrid>
          <Field label="Document type">
            <Select name="kind" defaultValue="PASSPORT_COPY">
              {(Object.keys(DOCUMENT_LABELS) as Array<keyof typeof DOCUMENT_LABELS>).map((kind) => (
                <option key={kind} value={kind}>
                  {DOCUMENT_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="File" hint="PDF, image or office document.">
            <input
              type="file"
              name="file"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-voya-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-voya-800 hover:file:bg-voya-200"
            />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <SubmitButton size="sm" variant="secondary" pendingLabel="Uploading…">
            Upload
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
