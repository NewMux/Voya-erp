import type { Prisma } from '@prisma/client';
import { testDb } from './db';

/** Minimal builders so tests state only what they are actually asserting on. */

let counter = 0;
const uniq = () => `${Date.now()}-${++counter}`;

export async function makeCustomer(overrides: Partial<Prisma.CustomerCreateInput> = {}) {
  return testDb.customer.create({
    data: {
      fullName: `Test Customer ${uniq()}`,
      phone: '+97333001122',
      whatsappPhone: '+97333001122',
      nationality: 'BH',
      ...overrides,
    },
  });
}

export async function makeSupplier(overrides: Partial<Prisma.SupplierCreateInput> = {}) {
  return testDb.supplier.create({
    data: {
      name: `Test Supplier ${uniq()}`,
      type: 'AIRLINE',
      ...overrides,
    },
  });
}

export async function makeDeparture(overrides: Partial<Prisma.GroupDepartureCreateInput> = {}) {
  return testDb.groupDeparture.create({
    data: {
      name: `Test Departure ${uniq()}`,
      departureDate: new Date('2026-10-12'),
      returnDate: new Date('2026-10-16'),
      capacity: 10,
      pricePerSeat: '400.000',
      singleSupplement: '90.000',
      status: 'OPEN',
      ...overrides,
    },
  });
}

/** The notification templates the services look up when enqueueing. */
export async function seedNotificationTemplates() {
  const templates: Prisma.NotificationTemplateCreateInput[] = [
    {
      key: 'booking_confirmed',
      event: 'BOOKING_CONFIRMED',
      name: 'Booking confirmation',
      bodyEn:
        'Hello {{customerName}}, booking {{reference}} is confirmed. Total {{total}}. ' +
        'Balance {{balanceDue}} due {{balanceDueDate}}.',
      variables: ['customerName', 'reference', 'total', 'balanceDue', 'balanceDueDate'],
    },
    {
      key: 'balance_due_reminder',
      event: 'BALANCE_DUE_REMINDER',
      name: 'Balance reminder',
      bodyEn: 'Hello {{customerName}}, {{amount}} for {{reference}} is due on {{dueDate}}.',
      variables: ['customerName', 'amount', 'reference', 'dueDate'],
    },
    {
      key: 'membership_renewal_reminder',
      event: 'MEMBERSHIP_RENEWAL_REMINDER',
      name: 'Membership renewal',
      bodyEn: 'Hello {{customerName}}, membership {{membershipNumber}} expires {{expiryDate}}.',
      variables: ['customerName', 'membershipNumber', 'expiryDate'],
    },
    {
      key: 'group_capacity_alert',
      event: 'GROUP_CAPACITY_ALERT',
      name: 'Capacity alert',
      bodyEn: '{{tripName}} is at {{percent}}% ({{seatsBooked}}/{{capacity}}).',
      variables: ['tripName', 'percent', 'seatsBooked', 'capacity'],
    },
  ];

  for (const template of templates) {
    await testDb.notificationTemplate.upsert({
      where: { key: template.key },
      update: {},
      create: template,
    });
  }
}
