import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Company details, invoice terms and the default membership discount.
 *
 * All of it lives in `AppSetting` as key/value rows rather than typed
 * columns, so a new setting is a row, not a migration. Read by the invoice
 * PDF route and the membership-issue form.
 */
export default async function SettingsPage() {
  await requireRole('ADMIN');

  const rows = await prisma.appSetting.findMany();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return (
    <>
      <PageHeader title="Settings" description="Company details and defaults. Admin only." />
      <SettingsForm settings={settings} />
    </>
  );
}
