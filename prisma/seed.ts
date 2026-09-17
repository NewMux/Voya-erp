import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Seed data.
 *
 * Split in two:
 *   * Reference data (staff logins, notification templates, app settings) is
 *     idempotent and safe to run against any environment, including production.
 *   * Demo data (a customer, a supplier, a group departure) is only created
 *     when SEED_DEMO=true, so a production deploy never grows fake bookings.
 */

const prisma = new PrismaClient();

const SEED_DEMO = process.env.SEED_DEMO === 'true';
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe123!';

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const users: Array<{ email: string; name: string; role: 'ADMIN' | 'ACCOUNTANT' | 'STAFF' }> = [
    { email: 'admin@voyatravel.bh', name: 'Voya Administrator', role: 'ADMIN' },
    { email: 'accounts@voyatravel.bh', name: 'Voya Accounts', role: 'ACCOUNTANT' },
    { email: 'staff@voyatravel.bh', name: 'Voya Reservations', role: 'STAFF' },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      // Never reset an existing user's password on re-seed.
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash },
    });
  }

  console.log(`  ✓ ${users.length} staff accounts`);
}

async function seedNotificationTemplates() {
  const templates: Prisma.NotificationTemplateCreateInput[] = [
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

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key: template.key },
      // Preserve any rewording staff have done in the Settings screen.
      update: { event: template.event, name: template.name, variables: template.variables },
      create: template,
    });
  }

  console.log(`  ✓ ${templates.length} notification templates`);
}

async function seedSettings() {
  const settings: Record<string, string> = {
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

  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  console.log(`  ✓ ${Object.keys(settings).length} settings`);
}

async function seedDemoData() {
  // Reference sequences are shared, so demo rows are only created when the
  // database has none — re-running must not mint a second demo customer.
  const existing = await prisma.customer.count();
  if (existing > 0) {
    console.log('  • demo data skipped (customers already exist)');
    return;
  }

  const supplier = await prisma.supplier.create({
    data: {
      name: 'Gulf Air',
      type: 'AIRLINE',
      contactEmail: 'trade@gulfair.com',
      country: 'BH',
      paymentTerms: 'CREDIT',
      creditDays: 30,
      commissionType: 'FIXED_PERCENT',
      commissionValue: '5.000',
      defaultCurrency: 'BHD',
      rateSheets: {
        create: {
          version: 1,
          name: '2026 net fares',
          effectiveFrom: new Date('2026-01-01'),
          currency: 'BHD',
        },
      },
    },
  });

  const hotelSupplier = await prisma.supplier.create({
    data: {
      name: 'Nirvana DMC Georgia',
      type: 'DMC',
      country: 'GE',
      paymentTerms: 'PREPAID',
      commissionType: 'NONE',
      defaultCurrency: 'USD',
    },
  });

  const customer = await prisma.customer.create({
    data: {
      fullName: 'Ahmed Al Khalifa',
      phone: '+97333001122',
      whatsappPhone: '+97333001122',
      email: 'ahmed@example.bh',
      nationality: 'BH',
      customerType: 'INDIVIDUAL',
      passportNumber: 'A1234567',
      passportExpiry: new Date('2029-04-30'),
    },
  });

  const membershipNumber = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('membership_number_seq')
  `;
  const seq = membershipNumber[0]?.nextval ?? 1n;

  await prisma.membership.create({
    data: {
      membershipNumber: `VY-${seq.toString().padStart(7, '0')}`,
      customerId: customer.id,
      tier: 'VOYAGEUR',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      expiryDate: new Date('2026-12-31'),
      discountPercent: '10.00',
      groupBookingPriority: true,
    },
  });

  const template = await prisma.groupTripTemplate.create({
    data: {
      name: 'Georgia Explorer',
      destination: 'Tbilisi, Georgia',
      summary: 'Five days across Tbilisi, Kazbegi and the Kakheti wine region.',
      durationDays: 5,
      itineraryDays: {
        create: [
          { dayNumber: 1, title: 'Arrival in Tbilisi', description: 'Transfer and old town walk.' },
          { dayNumber: 2, title: 'Kazbegi day trip', description: 'Gergeti Trinity Church.' },
          { dayNumber: 3, title: 'Kakheti wine region', description: 'Two winery visits.' },
          { dayNumber: 4, title: 'Tbilisi free day', description: 'Optional sulphur baths.' },
          { dayNumber: 5, title: 'Departure', description: 'Airport transfer.' },
        ],
      },
    },
  });

  await prisma.groupDeparture.create({
    data: {
      templateId: template.id,
      name: 'Georgia Explorer — October 2026',
      destination: 'Tbilisi, Georgia',
      departureDate: new Date('2026-10-12'),
      returnDate: new Date('2026-10-16'),
      capacity: 18,
      pricePerSeat: '425.000',
      singleSupplement: '95.000',
      currency: 'BHD',
      status: 'OPEN',
      tourLeaderName: 'Voya Tour Leader',
    },
  });

  console.log(
    `  ✓ demo data: ${[supplier.name, hotelSupplier.name].join(', ')}, 1 customer, 1 departure`,
  );
}

async function main() {
  console.log('Seeding Voya ERP…');
  await seedUsers();
  await seedNotificationTemplates();
  await seedSettings();

  if (SEED_DEMO) {
    await seedDemoData();
  } else {
    console.log('  • demo data skipped (set SEED_DEMO=true to include it)');
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
