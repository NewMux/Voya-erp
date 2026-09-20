import { requireRole } from '@/server/guards';
import { prisma } from '@/lib/prisma';
import { Card, LinkButton, PageHeader } from '@/components/ui';
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          title="Visa countries"
          description="Embassy, fee, documents, terms and processing time per destination."
        >
          <LinkButton href="/settings/visa-countries" variant="secondary" size="sm">
            Manage visa countries
          </LinkButton>
        </Card>
        <Card
          title="Partner offers"
          description="External partners offering discounts and benefits to Voya members."
        >
          <LinkButton href="/settings/partner-offers" variant="secondary" size="sm">
            Manage partner offers
          </LinkButton>
        </Card>
      </div>

      <SettingsForm settings={settings} />
    </>
  );
}
