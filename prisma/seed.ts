import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
// Plain ESM, shared with the production container where no TypeScript
// toolchain exists. See prisma/reference-data.mjs.
import { seedReferenceData } from './reference-data.mjs';

/**
 * Development seed.
 *
 * Reference data (staff logins, WhatsApp templates, company settings) comes
 * from the shared module that the container also uses, so there is one source
 * of truth. Demo data is added only when SEED_DEMO=true, so a production run
 * never grows fake bookings.
 */

const prisma = new PrismaClient();

async function seedDemoData() {
  // Reference sequences are shared, so demo rows are only created when the
  // database has none — re-running must not mint a second demo customer.
  if ((await prisma.customer.count()) > 0) {
    console.log('  • demo data skipped (customers already exist)');
    return;
  }

  const airline = await prisma.supplier.create({
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

  const dmc = await prisma.supplier.create({
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

  const [seq] = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('membership_number_seq')
  `;

  await prisma.membership.create({
    data: {
      membershipNumber: `VY-${(seq?.nextval ?? 1n).toString().padStart(7, '0')}`,
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

  console.log(`  ✓ demo data: ${airline.name}, ${dmc.name}, 1 customer, 1 departure`);
}

async function main() {
  console.log('Seeding Voya ERP…');
  await seedReferenceData(prisma, bcrypt, { log: (msg: string) => console.log(msg) });

  if (process.env.SEED_DEMO === 'true') {
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
