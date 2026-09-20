import { redirect } from 'next/navigation';

/** Memberships merged into the Customers page — see /customers?tab=members. */
export default function MembershipsRedirect() {
  redirect('/customers?tab=members');
}
