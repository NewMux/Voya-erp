import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import { makeCustomer, seedNotificationTemplates } from './helpers/factories';
import { createBooking } from '@/server/services/booking.service';
import {
  cancelInvoice,
  createInvoice,
  invoiceLinesFromBookings,
  markOverdueInvoices,
  recordPayment,
  recordRefund,
  sendInvoice,
  setRefundStatus,
  voidPayment,
} from '@/server/services/invoice.service';
import { recalcInvoiceStatus } from '@/server/services/payment.service';

beforeEach(async () => {
  await resetDatabase();
  await seedNotificationTemplates();
});
afterAll(disconnect);

async function bookingWithPlan(sellingAmount = '1000', depositPercent = 30) {
  const customer = await makeCustomer();
  const booking = await createBooking({
    customerId: customer.id,
    type: 'FLIGHT',
    sellingAmount,
    costAmount: '600',
    depositType: 'PERCENT',
    depositValue: depositPercent,
    balanceDueDate: new Date('2099-09-01'),
    flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'DXB' },
  });
  return { customer, booking };
}

describe('payment roll-up', () => {
  it('moves through unpaid, deposit paid and fully paid', async () => {
    const { customer, booking } = await bookingWithPlan();
    const deposit = booking.scheduleItems.find((i) => i.kind === 'DEPOSIT')!;
    const balance = booking.scheduleItems.find((i) => i.kind === 'BALANCE')!;

    expect(booking.paymentStatus).toBe('UNPAID');

    await recordPayment({
      customerId: customer.id,
      amount: '300',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, scheduleItemId: deposit.id, amount: '300' }],
    });
    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('DEPOSIT_PAID');

    await recordPayment({
      customerId: customer.id,
      amount: '700',
      method: 'BANK_TRANSFER',
      allocations: [{ bookingId: booking.id, scheduleItemId: balance.id, amount: '700' }],
    });
    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('FULLY_PAID');
  });

  it('treats a part payment below the deposit as deposit paid', async () => {
    // The PRD allows only three states, so any money received reads as part paid.
    const { customer, booking } = await bookingWithPlan();

    await recordPayment({
      customerId: customer.id,
      amount: '50',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '50' }],
    });

    const after = await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.paymentStatus).toBe('DEPOSIT_PAID');

    const deposit = await testDb.paymentScheduleItem.findFirstOrThrow({
      where: { bookingId: booking.id, kind: 'DEPOSIT' },
    });
    expect(deposit.status).toBe('PARTIALLY_PAID');
    expect(deposit.paidAmount.toString()).toBe('50');
  });

  it('waterfalls an unassigned payment across instalments in due order', async () => {
    // A walk-in payment with no instruction should clear the deposit first.
    const { customer, booking } = await bookingWithPlan();

    await recordPayment({
      customerId: customer.id,
      amount: '500',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '500' }],
    });

    const items = await testDb.paymentScheduleItem.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequence: 'asc' },
    });

    expect(items[0]?.kind).toBe('DEPOSIT');
    expect(items[0]?.paidAmount.toString()).toBe('300');
    expect(items[0]?.status).toBe('PAID');
    expect(items[1]?.paidAmount.toString()).toBe('200');
    expect(items[1]?.status).toBe('PARTIALLY_PAID');
  });

  it('settles the deposit first even when the balance is dated earlier', async () => {
    // Rescheduling a balance earlier must not let it jump the deposit in the
    // waterfall: the deposit is due at booking time by definition.
    const { customer, booking } = await bookingWithPlan();

    const balance = booking.scheduleItems.find((i) => i.kind === 'BALANCE')!;
    await testDb.paymentScheduleItem.update({
      where: { id: balance.id },
      data: { dueDate: new Date('2020-01-01') },
    });

    await recordPayment({
      customerId: customer.id,
      amount: '300',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '300' }],
    });

    const items = await testDb.paymentScheduleItem.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequence: 'asc' },
    });
    expect(items[0]?.kind).toBe('DEPOSIT');
    expect(items[0]?.status).toBe('PAID');
    expect(items[1]?.status).toBe('PENDING');
  });

  it('rejects an allocation larger than the payment', async () => {
    const { customer, booking } = await bookingWithPlan();

    await expect(
      recordPayment({
        customerId: customer.id,
        amount: '100',
        method: 'CASH',
        allocations: [{ bookingId: booking.id, amount: '500' }],
      }),
    ).rejects.toThrow(/cannot exceed the payment amount/i);
  });

  it('rejects a zero or negative payment', async () => {
    const { customer } = await bookingWithPlan();
    await expect(
      recordPayment({ customerId: customer.id, amount: '0', method: 'CASH' }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('reverts the roll-up when a payment is voided', async () => {
    const { customer, booking } = await bookingWithPlan();

    const payment = await recordPayment({
      customerId: customer.id,
      amount: '1000',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '1000' }],
    });
    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('FULLY_PAID');

    await voidPayment(payment.id);
    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('UNPAID');
  });
});

describe('refunds', () => {
  it('only reduces what is paid once processed', async () => {
    const { customer, booking } = await bookingWithPlan();

    await recordPayment({
      customerId: customer.id,
      amount: '1000',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '1000' }],
    });

    // A pending refund is a request, not money out of the account.
    const refund = await recordRefund({
      bookingId: booking.id,
      amount: '400',
      reason: 'Partial cancellation',
      status: 'PENDING',
    });
    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('FULLY_PAID');

    await setRefundStatus({ refundId: refund.id, status: 'PROCESSED' });
    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('DEPOSIT_PAID');
  });

  it('pulls an instalment back out of PAID when refunded', async () => {
    const { customer, booking } = await bookingWithPlan();

    await recordPayment({
      customerId: customer.id,
      amount: '1000',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '1000' }],
    });

    await recordRefund({
      bookingId: booking.id,
      amount: '1000',
      status: 'PROCESSED',
      reason: 'Cancelled',
    });

    const after = await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.paymentStatus).toBe('UNPAID');
  });

  it('ignores a rejected refund', async () => {
    const { customer, booking } = await bookingWithPlan();
    await recordPayment({
      customerId: customer.id,
      amount: '1000',
      method: 'CASH',
      allocations: [{ bookingId: booking.id, amount: '1000' }],
    });

    const refund = await recordRefund({ bookingId: booking.id, amount: '500', status: 'PENDING' });
    await setRefundStatus({ refundId: refund.id, status: 'REJECTED' });

    expect(
      (await testDb.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus,
    ).toBe('FULLY_PAID');
  });

  it('rejects a zero refund', async () => {
    const { booking } = await bookingWithPlan();
    await expect(recordRefund({ bookingId: booking.id, amount: '0' })).rejects.toThrow(
      /greater than zero/i,
    );
  });
});

describe('invoices', () => {
  it('numbers sequentially and totals its lines', async () => {
    const customer = await makeCustomer();

    const invoice = await createInvoice({
      customerId: customer.id,
      lines: [
        { description: 'Flight BAH-DXB', unitPrice: '250.500' },
        { description: 'Hotel, 3 nights', quantity: 3, unitPrice: '100' },
      ],
    });

    expect(invoice.number).toMatch(/^VOY-\d{4}-\d{6}$/);
    expect(invoice.subtotal.toString()).toBe('550.5');
    expect(invoice.total.toString()).toBe('550.5');
    expect(invoice.status).toBe('DRAFT');
  });

  it('applies an invoice-level discount', async () => {
    const customer = await makeCustomer();
    const invoice = await createInvoice({
      customerId: customer.id,
      discountTotal: '50',
      lines: [{ description: 'Package', unitPrice: '500' }],
    });

    expect(invoice.total.toString()).toBe('450');
  });

  it('refuses a discount larger than the subtotal', async () => {
    const customer = await makeCustomer();
    await expect(
      createInvoice({
        customerId: customer.id,
        discountTotal: '600',
        lines: [{ description: 'Package', unitPrice: '500' }],
      }),
    ).rejects.toThrow(/discount cannot exceed/i);
  });

  it('refuses an invoice with no lines', async () => {
    const customer = await makeCustomer();
    await expect(createInvoice({ customerId: customer.id, lines: [] })).rejects.toThrow(
      /at least one line/i,
    );
  });

  it('refuses a due date before the issue date', async () => {
    const customer = await makeCustomer();
    await expect(
      createInvoice({
        customerId: customer.id,
        issueDate: new Date('2026-06-01'),
        dueDate: new Date('2026-05-01'),
        lines: [{ description: 'Package', unitPrice: '500' }],
      }),
    ).rejects.toThrow(/due date cannot be before/i);
  });

  it('bundles several bookings for one customer', async () => {
    const customer = await makeCustomer();

    const flight = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      sellingAmount: '400',
      flight: { airline: 'Gulf Air', routeFrom: 'BAH', routeTo: 'TBS' },
    });
    const hotel = await createBooking({
      customerId: customer.id,
      type: 'HOTEL',
      sellingAmount: '600',
      hotel: {
        propertyName: 'Tbilisi Grand',
        checkIn: new Date('2026-10-12'),
        checkOut: new Date('2026-10-16'),
      },
    });

    const lines = await invoiceLinesFromBookings([flight.id, hotel.id]);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.description.includes('Gulf Air'))).toBe(true);
    expect(lines.some((l) => l.description.includes('Tbilisi Grand'))).toBe(true);

    const invoice = await createInvoice({ customerId: customer.id, lines });
    expect(invoice.total.toString()).toBe('1000');
    expect(invoice.lines).toHaveLength(2);
  });

  it('prices invoice lines from the discounted amount, never the cost', async () => {
    const customer = await makeCustomer();
    const booking = await createBooking({
      customerId: customer.id,
      type: 'VISA',
      sellingAmount: '200',
      costAmount: '120',
      visa: { destinationCountry: 'GE', visaType: 'Tourist' },
    });

    const lines = await invoiceLinesFromBookings([booking.id]);
    expect(lines[0]?.unitPrice).toBe('200');
  });
});

describe('invoice status', () => {
  async function sentInvoice(dueDate: Date) {
    const customer = await makeCustomer();
    const invoice = await createInvoice({
      customerId: customer.id,
      issueDate: new Date('2026-01-01'),
      dueDate,
      lines: [{ description: 'Package', unitPrice: '1000' }],
    });
    await sendInvoice(invoice.id);
    return { customer, invoice };
  }

  it('stays draft until sent', async () => {
    const customer = await makeCustomer();
    const invoice = await createInvoice({
      customerId: customer.id,
      dueDate: new Date('2020-01-01'),
      issueDate: new Date('2019-01-01'),
      lines: [{ description: 'Package', unitPrice: '100' }],
    });

    // A draft cannot be overdue, however old it is.
    expect(await recalcInvoiceStatus(testDb, invoice.id)).toBe('DRAFT');
  });

  it('is overdue immediately when sent after the due date', async () => {
    const { invoice } = await sentInvoice(new Date('2026-02-01'));
    const current = await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(current.status).toBe('OVERDUE');
  });

  it('moves to partially paid and then paid', async () => {
    const { customer, invoice } = await sentInvoice(new Date('2099-01-01'));

    await recordPayment({
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: '400',
      method: 'CARD',
    });
    expect(
      (await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('PARTIALLY_PAID');

    await recordPayment({
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: '600',
      method: 'BENEFIT_PAY',
    });
    const paid = await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe('PAID');
    expect(paid.paidAmount.toString()).toBe('1000');
  });

  it('sweeps sent invoices past their due date to overdue', async () => {
    await sentInvoice(new Date('2026-03-01'));
    // Already swept on send; the sweep must be idempotent, not error.
    const count = await markOverdueInvoices(testDb, new Date('2026-06-01'));
    expect(count).toBeGreaterThanOrEqual(0);

    const overdue = await testDb.invoice.count({ where: { status: 'OVERDUE' } });
    expect(overdue).toBe(1);
  });

  it('refuses to cancel an invoice with payments against it', async () => {
    const { customer, invoice } = await sentInvoice(new Date('2099-01-01'));
    await recordPayment({
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: '100',
      method: 'CASH',
    });

    await expect(cancelInvoice(invoice.id)).rejects.toThrow(/has payments against it/i);
  });

  it('cancels an unpaid invoice and does not resurrect it', async () => {
    const { customer, invoice } = await sentInvoice(new Date('2099-01-01'));
    await cancelInvoice(invoice.id);

    await recordPayment({
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: '100',
      method: 'CASH',
    });

    expect(
      (await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
    ).toBe('CANCELLED');
  });

  it('refuses to send a cancelled invoice', async () => {
    const { invoice } = await sentInvoice(new Date('2099-01-01'));
    await cancelInvoice(invoice.id);
    await expect(sendInvoice(invoice.id)).rejects.toThrow(/cancelled invoice cannot be sent/i);
  });
});
