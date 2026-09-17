/**
 * Phase 1 acceptance walkthrough.
 *
 * Drives the PRD's headline path through the real service layer against a real
 * database, then prints what it produced. Run against the development database:
 *
 *   npx dotenv -e .env -- npx tsx scripts/acceptance.ts
 *
 * This is a manual verification aid, not part of the test suite — the suite
 * covers the same rules in isolation under tests/.
 */

import { PrismaClient } from '@prisma/client';
import { createBooking, updateBookingStatus } from '../src/server/services/booking.service';
import { issueMembership } from '../src/server/services/membership.service';
import { recordPayment } from '../src/server/services/invoice.service';

const prisma = new PrismaClient();

function step(n: number, title: string) {
  console.log(`\n${n}. ${title}`);
}

function ok(message: string) {
  console.log(`   ✓ ${message}`);
}

async function main() {
  const stamp = Date.now();

  step(1, 'Create a customer and issue a membership');
  const customer = await prisma.customer.create({
    data: {
      fullName: `Acceptance Customer ${stamp}`,
      phone: '+97333445566',
      whatsappPhone: '+97333445566',
      nationality: 'BH',
      passportNumber: `P${stamp}`,
      passportExpiry: new Date('2030-01-01'),
    },
  });
  const membership = await prisma.$transaction((tx) =>
    issueMembership(tx, {
      customerId: customer.id,
      discountPercent: 10,
      startDate: new Date('2026-01-01'),
      expiryDate: new Date('2099-12-31'),
    }),
  );
  ok(`membership ${membership.membershipNumber} at ${membership.discountPercent}%`);

  step(2, 'Create a Group Adventure departure with capacity 2');
  const departure = await prisma.groupDeparture.create({
    data: {
      name: `Acceptance Trip ${stamp}`,
      departureDate: new Date('2026-11-20'),
      returnDate: new Date('2026-11-25'),
      capacity: 2,
      pricePerSeat: '500.000',
      singleSupplement: '100.000',
      status: 'OPEN',
    },
  });
  ok(`departure ${departure.name}, capacity ${departure.capacity}`);

  step(3, 'Book with a 30% deposit — membership discount should apply automatically');
  const booking = await createBooking({
    customerId: customer.id,
    type: 'GROUP_ADVENTURE',
    sellingAmount: '1000',
    costAmount: '600',
    costCurrency: 'BHD',
    fxRate: 1,
    depositType: 'PERCENT',
    depositValue: 30,
    balanceDueDate: new Date('2026-10-06'),
    departureDate: new Date('2026-11-20'),
    status: 'CONFIRMED',
    groupAdventure: { departureId: departure.id, seats: 2 },
  });
  ok(`booking ${booking.reference}`);
  ok(`discount ${booking.membershipDiscountPercent}% = ${booking.membershipDiscountAmount}`);
  ok(`customer pays ${booking.netSellingAmount}, margin ${booking.marginAmount}`);
  ok(
    `instalments: ${booking.scheduleItems
      .map((i) => `${i.kind} ${i.amountDue} due ${i.dueDate.toISOString().slice(0, 10)}`)
      .join(' | ')}`,
  );
  ok(`payment status: ${booking.paymentStatus}`);

  step(4, 'Record the deposit, then the balance');
  const deposit = booking.scheduleItems.find((i) => i.kind === 'DEPOSIT');
  const balance = booking.scheduleItems.find((i) => i.kind === 'BALANCE');

  await recordPayment({
    customerId: customer.id,
    amount: deposit!.amountDue.toString(),
    method: 'BENEFIT_PAY',
    paidAt: new Date(),
    allocations: [
      { bookingId: booking.id, scheduleItemId: deposit!.id, amount: deposit!.amountDue.toString() },
    ],
  });
  let current = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  ok(`after deposit: ${current.paymentStatus}`);

  await recordPayment({
    customerId: customer.id,
    amount: balance!.amountDue.toString(),
    method: 'BANK_TRANSFER',
    paidAt: new Date(),
    allocations: [
      { bookingId: booking.id, scheduleItemId: balance!.id, amount: balance!.amountDue.toString() },
    ],
  });
  current = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  ok(`after balance: ${current.paymentStatus}`);

  step(5, 'Departure should now be full; a further booking must be refused');
  const afterBooking = await prisma.groupDeparture.findUniqueOrThrow({
    where: { id: departure.id },
  });
  ok(`seats ${afterBooking.seatsBooked}/${afterBooking.capacity}, status ${afterBooking.status}`);
  ok(`waitlist enabled: ${afterBooking.waitlistEnabled}`);

  const other = await prisma.customer.create({
    data: { fullName: `Waitlisted ${stamp}`, phone: '+97333778899' },
  });

  try {
    await createBooking({
      customerId: other.id,
      type: 'GROUP_ADVENTURE',
      sellingAmount: '500',
      groupAdventure: { departureId: departure.id, seats: 1 },
    });
    console.log('   ✗ EXPECTED A CAPACITY ERROR BUT THE BOOKING SUCCEEDED');
    process.exitCode = 1;
  } catch (error) {
    ok(`refused: ${(error as Error).message}`);
  }

  await prisma.groupWaitlistEntry.create({
    data: { departureId: departure.id, customerId: other.id, requestedSeats: 1, priority: false },
  });
  ok('customer added to the waitlist');

  step(6, 'Notification outbox');
  const outbox = await prisma.notificationOutbox.findMany({
    where: { OR: [{ bookingId: booking.id }, { departureId: departure.id }] },
  });
  for (const row of outbox) {
    ok(`${row.event} → ${row.toPhone} [${row.status}]`);
  }
  if (outbox.length === 0) {
    console.log('   ! no notifications queued');
  }

  step(7, 'Cancel the booking — seats released, instalments closed');
  await updateBookingStatus({
    bookingId: booking.id,
    status: 'CANCELLED',
    cancelReason: 'Acceptance run',
  });
  const afterCancel = await prisma.groupDeparture.findUniqueOrThrow({
    where: { id: departure.id },
  });
  ok(`seats ${afterCancel.seatsBooked}/${afterCancel.capacity}, status ${afterCancel.status}`);

  console.log('\nAcceptance walkthrough complete.');
  console.log(`Booking:  /bookings/${booking.id}`);
  console.log(`Customer: /customers/${customer.id}`);
  console.log(`Trip:     /group-trips/departures/${departure.id}`);
}

main()
  .catch((error) => {
    console.error('\nAcceptance run failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
