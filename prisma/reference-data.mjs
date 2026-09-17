/**
 * Reference data — staff logins, WhatsApp templates, company settings.
 *
 * Plain ESM rather than TypeScript so it runs in the production container,
 * which has @prisma/client and bcryptjs but no TypeScript toolchain. The
 * TypeScript dev seed imports this same module, so there is one source of truth
 * for the template wording.
 *
 * Every write is an upsert that preserves existing values, so this is safe to
 * run on every deploy: it will not reset a password an admin has changed or
 * overwrite wording staff have edited in the Settings screen.
 */

export const STAFF = [
  { email: 'admin@voyatravel.bh', name: 'Voya Administrator', role: 'ADMIN' },
  { email: 'accounts@voyatravel.bh', name: 'Voya Accounts', role: 'ACCOUNTANT' },
  { email: 'staff@voyatravel.bh', name: 'Voya Reservations', role: 'STAFF' },
];

export const NOTIFICATION_TEMPLATES = [
  {
    key: 'booking_confirmed',
    event: 'BOOKING_CONFIRMED',
    name: 'Booking confirmation',
    bodyEn:
      'Hello {{customerName}}, your {{bookingType}} booking with Voya Travel is confirmed. ' +
      'Reference: {{reference}}. Travel date: {{travelDate}}. Total: {{total}}. ' +
      'Balance of {{balanceDue}} is due by {{balanceDueDate}}. Thank you for choosing Voya.',
    bodyAr:
      'مرحباً {{customerName}}، تم تأكيد حجزك ({{bookingType}}) لدى فويا للسفر. ' +
      'الرقم المرجعي: {{reference}}. تاريخ السفر: {{travelDate}}. الإجمالي: {{total}}. ' +
      'المبلغ المتبقي {{balanceDue}} مستحق بتاريخ {{balanceDueDate}}. شكراً لاختياركم فويا.',
    metaTemplateName: 'voya_booking_confirmed',
    metaLanguageCode: 'en',
    variables: [
      'customerName',
      'bookingType',
      'reference',
      'travelDate',
      'total',
      'balanceDue',
      'balanceDueDate',
    ],
  },
  {
    key: 'balance_due_reminder',
    event: 'BALANCE_DUE_REMINDER',
    name: 'Balance due reminder',
    bodyEn:
      'Hello {{customerName}}, a friendly reminder that the remaining balance of {{amount}} ' +
      'for booking {{reference}} is due on {{dueDate}}. Travel date: {{travelDate}}. ' +
      'Please contact Voya Travel to settle. Thank you.',
    bodyAr:
      'مرحباً {{customerName}}، نذكّركم بأن المبلغ المتبقي {{amount}} للحجز {{reference}} ' +
      'مستحق بتاريخ {{dueDate}}. تاريخ السفر: {{travelDate}}. ' +
      'يرجى التواصل مع فويا للسفر للسداد. شكراً لكم.',
    metaTemplateName: 'voya_balance_reminder',
    metaLanguageCode: 'en',
    variables: ['customerName', 'amount', 'reference', 'dueDate', 'travelDate'],
  },
  {
    key: 'membership_renewal_reminder',
    event: 'MEMBERSHIP_RENEWAL_REMINDER',
    name: 'Membership renewal reminder',
    bodyEn:
      'Hello {{customerName}}, your Voya {{tier}} membership ({{membershipNumber}}) expires on ' +
      '{{expiryDate}}. Renew to keep your member discount and priority booking on group ' +
      'adventures. Contact us to renew.',
    bodyAr:
      'مرحباً {{customerName}}، تنتهي عضويتك في فويا ({{membershipNumber}}) بتاريخ {{expiryDate}}. ' +
      'جدّد عضويتك للاحتفاظ بخصم الأعضاء وأولوية الحجز في الرحلات الجماعية. ' +
      'يرجى التواصل معنا للتجديد.',
    metaTemplateName: 'voya_membership_renewal',
    metaLanguageCode: 'en',
    variables: ['customerName', 'membershipNumber', 'tier', 'expiryDate'],
  },
  {
    key: 'group_capacity_alert',
    event: 'GROUP_CAPACITY_ALERT',
    name: 'Group adventure capacity alert (staff)',
    bodyEn:
      'Voya staff alert: {{tripName}} departing {{departureDate}} is at {{percent}}% capacity ' +
      '({{seatsBooked}}/{{capacity}} seats booked, {{seatsRemaining}} remaining).',
    bodyAr: null,
    metaTemplateName: 'voya_capacity_alert',
    metaLanguageCode: 'en',
    variables: [
      'tripName',
      'departureDate',
      'percent',
      'seatsBooked',
      'capacity',
      'seatsRemaining',
    ],
  },
];

export const SETTINGS = {
  'company.name': 'Voya Travel & Tourism',
  'company.nameAr': 'فويا للسفر والسياحة',
  'company.address': "Ramli Petrol Station, Office 345, A'ali, Bahrain",
  'company.addressAr': 'محطة الرملي للبترول، مكتب ٣٤٥، عالي، البحرين',
  'company.phone': '+973 0000 0000',
  'company.email': 'info@voyatravel.bh',
  'company.instagram': '@voyatravelbh',
  'invoice.terms':
    'Payment is due by the date shown above. Bank transfer and Benefit Pay accepted.',
  'invoice.termsAr': 'السداد مستحق بحلول التاريخ المبين أعلاه. نقبل التحويل البنكي وبنفت بي.',
  'membership.defaultDiscountPercent': '10',
};

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ hash: (data: string, rounds: number) => Promise<string> }} bcrypt
 * @param {{ password?: string, log?: (msg: string) => void }} [options]
 */
export async function seedReferenceData(prisma, bcrypt, options = {}) {
  const log = options.log ?? (() => {});
  const password = options.password ?? process.env.SEED_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 12);

  for (const staff of STAFF) {
    await prisma.user.upsert({
      where: { email: staff.email },
      // Never reset an existing user's password on re-seed.
      update: { name: staff.name, role: staff.role },
      create: { ...staff, passwordHash },
    });
  }
  log(`  ✓ ${STAFF.length} staff accounts`);

  for (const template of NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: template.key },
      // Preserve any rewording done in the Settings screen.
      update: { event: template.event, name: template.name, variables: template.variables },
      create: template,
    });
  }
  log(`  ✓ ${NOTIFICATION_TEMPLATES.length} notification templates`);

  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  log(`  ✓ ${Object.keys(SETTINGS).length} settings`);
}
