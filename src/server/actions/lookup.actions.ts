'use server';

import { requireUser } from '@/server/guards';
import { searchCustomers } from '@/server/services/customer.service';
import { toInputDate } from '@/lib/dates';
import { today } from '@/lib/dates';
import type { PickerCustomer } from '@/app/(app)/bookings/new/customer-picker';

/**
 * Lookups called from client components.
 *
 * Kept separate from the mutating actions so it is obvious at a glance which
 * server actions change data and which only read. Still guarded — an
 * unauthenticated caller must not be able to enumerate the customer list.
 */

export async function lookupCustomers(query: string): Promise<PickerCustomer[]> {
  await requireUser();

  const customers = await searchCustomers(query, { limit: 8 });
  const now = today();

  return customers.map((customer) => ({
    id: customer.id,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    nationality: customer.nationality,
    passportNumber: customer.passportNumber,
    passportExpiry: customer.passportExpiry ? toInputDate(customer.passportExpiry) : null,
    customerType: customer.customerType,
    companyName: customer.companyName,
    membership: customer.membership
      ? {
          membershipNumber: customer.membership.membershipNumber,
          tier: customer.membership.tier,
          discountPercent: customer.membership.discountPercent.toString(),
          // The same rule the booking service applies: status *and* dates.
          active:
            customer.membership.status === 'ACTIVE' &&
            customer.membership.startDate.getTime() <= now.getTime() &&
            customer.membership.expiryDate.getTime() >= now.getTime(),
          expiryDate: toInputDate(customer.membership.expiryDate),
        }
      : null,
  }));
}
