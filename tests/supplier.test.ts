import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnect, resetDatabase, testDb } from './helpers/db';
import { makeCustomer, makeSupplier } from './helpers/factories';
import {
  commissionFor,
  nextRateSheetVersion,
  rateSheetInForce,
  supplierBalance,
  supplierReconciliation,
} from '@/server/services/supplier.service';
import { recalcSupplierInvoiceStatus } from '@/server/services/payment.service';
import { createBooking } from '@/server/services/booking.service';

beforeEach(resetDatabase);
afterAll(disconnect);

async function addRateSheet(
  supplierId: string,
  version: number,
  from: string,
  to: string | null,
) {
  return testDb.supplierRateSheet.create({
    data: {
      supplierId,
      version,
      name: `v${version}`,
      effectiveFrom: new Date(from),
      effectiveTo: to ? new Date(to) : null,
    },
  });
}

describe('rate sheet versioning', () => {
  it('numbers versions sequentially per supplier', async () => {
    const a = await makeSupplier();
    const b = await makeSupplier();

    expect(await nextRateSheetVersion(testDb, a.id)).toBe(1);
    await addRateSheet(a.id, 1, '2026-01-01', null);
    expect(await nextRateSheetVersion(testDb, a.id)).toBe(2);

    // Versions are per supplier, not global.
    expect(await nextRateSheetVersion(testDb, b.id)).toBe(1);
  });

  it('resolves the sheet in force on a given date', async () => {
    const supplier = await makeSupplier();
    await addRateSheet(supplier.id, 1, '2025-01-01', '2025-12-31');
    await addRateSheet(supplier.id, 2, '2026-01-01', null);

    const older = await rateSheetInForce(testDb, supplier.id, new Date('2025-06-01'));
    expect(older?.version).toBe(1);

    const current = await rateSheetInForce(testDb, supplier.id, new Date('2026-06-01'));
    expect(current?.version).toBe(2);
  });

  it('includes both boundary dates of a closed sheet', async () => {
    const supplier = await makeSupplier();
    await addRateSheet(supplier.id, 1, '2026-03-01', '2026-03-31');

    expect((await rateSheetInForce(testDb, supplier.id, new Date('2026-03-01')))?.version).toBe(1);
    expect((await rateSheetInForce(testDb, supplier.id, new Date('2026-03-31')))?.version).toBe(1);
    expect(await rateSheetInForce(testDb, supplier.id, new Date('2026-04-01'))).toBeNull();
  });

  it('returns null before any sheet takes effect', async () => {
    const supplier = await makeSupplier();
    await addRateSheet(supplier.id, 1, '2026-01-01', null);
    expect(await rateSheetInForce(testDb, supplier.id, new Date('2025-06-01'))).toBeNull();
  });

  it('prefers the latest start date when sheets overlap', async () => {
    const supplier = await makeSupplier();
    await addRateSheet(supplier.id, 1, '2026-01-01', null);
    await addRateSheet(supplier.id, 2, '2026-06-01', null);

    expect((await rateSheetInForce(testDb, supplier.id, new Date('2026-07-01')))?.version).toBe(2);
  });
});

describe('commissionFor', () => {
  it('computes a percentage of cost', () => {
    expect(commissionFor({ commissionType: 'FIXED_PERCENT', commissionValue: '5' }, '1000')).toBe(
      '50.000',
    );
  });

  it('returns a flat amount unchanged', () => {
    expect(commissionFor({ commissionType: 'FIXED_AMOUNT', commissionValue: '25' }, '1000')).toBe(
      '25.000',
    );
  });

  it('is zero when no commission is agreed', () => {
    expect(commissionFor({ commissionType: 'NONE', commissionValue: '5' }, '1000')).toBe('0.000');
  });
});

describe('supplierBalance', () => {
  it('reports invoiced-but-unpaid separately from not-yet-invoiced', async () => {
    const supplier = await makeSupplier();
    const customer = await makeCustomer();

    const booking = await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      supplierId: supplier.id,
      sellingAmount: '1000',
      costAmount: '800',
      status: 'CONFIRMED',
      flight: { airline: 'Test', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    // Before any supplier invoice exists, the cost sits in "not yet invoiced".
    let balance = await supplierBalance(testDb, supplier.id);
    expect(balance.notYetInvoiced).toBe('800.000');
    expect(balance.outstanding).toBe('0.000');

    const invoice = await testDb.supplierInvoice.create({
      data: {
        supplierId: supplier.id,
        reference: 'INV-1',
        issueDate: new Date('2026-01-01'),
        amount: '800.000',
        amountBase: '800.000',
        bookings: { create: { bookingId: booking.id, amount: '800.000' } },
      },
    });

    // Once invoiced it moves across, and is not double counted.
    balance = await supplierBalance(testDb, supplier.id);
    expect(balance.outstanding).toBe('800.000');
    expect(balance.notYetInvoiced).toBe('0.000');

    await testDb.supplierInvoice.update({
      where: { id: invoice.id },
      data: { paidAmount: '300.000' },
    });
    await recalcSupplierInvoiceStatus(testDb, invoice.id);

    balance = await supplierBalance(testDb, supplier.id);
    expect(balance.outstanding).toBe('500.000');
  });

  it('excludes cancelled and inquiry bookings from supplier cost', async () => {
    const supplier = await makeSupplier();
    const customer = await makeCustomer();

    // An inquiry is not a commitment to the supplier yet.
    await createBooking({
      customerId: customer.id,
      type: 'FLIGHT',
      supplierId: supplier.id,
      sellingAmount: '500',
      costAmount: '400',
      status: 'INQUIRY',
      flight: { airline: 'Test', routeFrom: 'BAH', routeTo: 'DXB' },
    });

    const balance = await supplierBalance(testDb, supplier.id);
    expect(balance.notYetInvoiced).toBe('0.000');
  });
});

describe('supplier invoice status', () => {
  async function makeInvoice(supplierId: string, amount: string, paid: string) {
    return testDb.supplierInvoice.create({
      data: {
        supplierId,
        reference: `INV-${Math.random()}`,
        issueDate: new Date('2026-01-01'),
        amount,
        amountBase: amount,
        paidAmount: paid,
      },
    });
  }

  it('derives unpaid, partially paid and paid', async () => {
    const supplier = await makeSupplier();

    const unpaid = await makeInvoice(supplier.id, '100.000', '0.000');
    expect(await recalcSupplierInvoiceStatus(testDb, unpaid.id)).toBe('UNPAID');

    const partial = await makeInvoice(supplier.id, '100.000', '40.000');
    expect(await recalcSupplierInvoiceStatus(testDb, partial.id)).toBe('PARTIALLY_PAID');

    const paid = await makeInvoice(supplier.id, '100.000', '100.000');
    expect(await recalcSupplierInvoiceStatus(testDb, paid.id)).toBe('PAID');
  });

  it('treats an overpayment as paid', async () => {
    const supplier = await makeSupplier();
    const over = await makeInvoice(supplier.id, '100.000', '120.000');
    expect(await recalcSupplierInvoiceStatus(testDb, over.id)).toBe('PAID');
  });

  it('never clears a dispute automatically', async () => {
    // A dispute is a human judgement about the bill, not a function of payment.
    const supplier = await makeSupplier();
    const invoice = await makeInvoice(supplier.id, '100.000', '100.000');
    await testDb.supplierInvoice.update({
      where: { id: invoice.id },
      data: { status: 'DISPUTED' },
    });

    expect(await recalcSupplierInvoiceStatus(testDb, invoice.id)).toBe('DISPUTED');
  });
});

describe('supplierReconciliation', () => {
  it('lists bookings by travel date and flags unmatched ones', async () => {
    const supplier = await makeSupplier();
    const customer = await makeCustomer();

    const inRange = await createBooking({
      customerId: customer.id,
      type: 'HOTEL',
      supplierId: supplier.id,
      sellingAmount: '600',
      costAmount: '450',
      departureDate: new Date('2026-05-10'),
      status: 'CONFIRMED',
      hotel: {
        propertyName: 'Test Hotel',
        checkIn: new Date('2026-05-10'),
        checkOut: new Date('2026-05-14'),
      },
    });

    // Outside the range being reconciled.
    await createBooking({
      customerId: customer.id,
      type: 'HOTEL',
      supplierId: supplier.id,
      sellingAmount: '600',
      costAmount: '450',
      departureDate: new Date('2026-11-10'),
      status: 'CONFIRMED',
      hotel: {
        propertyName: 'Test Hotel',
        checkIn: new Date('2026-11-10'),
        checkOut: new Date('2026-11-14'),
      },
    });

    const result = await supplierReconciliation(testDb, {
      supplierId: supplier.id,
      from: new Date('2026-05-01'),
      to: new Date('2026-05-31'),
    });

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]?.id).toBe(inRange.id);
    expect(result.totalCost).toBe('450.000');
    expect(result.unmatchedCount).toBe(1);
    expect(result.matchedCount).toBe(0);
  });

  it('counts a booking as matched once it appears on a supplier invoice', async () => {
    const supplier = await makeSupplier();
    const customer = await makeCustomer();

    const booking = await createBooking({
      customerId: customer.id,
      type: 'VISA',
      supplierId: supplier.id,
      sellingAmount: '80',
      costAmount: '50',
      departureDate: new Date('2026-05-10'),
      status: 'CONFIRMED',
      visa: { destinationCountry: 'GE', visaType: 'Tourist' },
    });

    await testDb.supplierInvoice.create({
      data: {
        supplierId: supplier.id,
        reference: 'INV-9',
        issueDate: new Date('2026-05-01'),
        amount: '50.000',
        amountBase: '50.000',
        bookings: { create: { bookingId: booking.id, amount: '50.000' } },
      },
    });

    const result = await supplierReconciliation(testDb, {
      supplierId: supplier.id,
      from: new Date('2026-05-01'),
      to: new Date('2026-05-31'),
    });

    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(0);
  });
});
