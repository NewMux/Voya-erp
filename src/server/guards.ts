import { redirect } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { auth } from './auth';

/**
 * Route and action guards.
 *
 * Phase 1 has three roles. The finance-sensitive reads the PRD calls out —
 * lifetime value, cost price, margin — are gated to ADMIN and ACCOUNTANT.
 * Middleware only decides whether a request is authenticated at all; these run
 * inside the page or action, which is where authorisation belongs.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

/** The signed-in user, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role,
  };
}

/** Require a signed-in user, redirecting to the login page otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

/** Require one of `roles`, sending anyone else to the dashboard. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/dashboard?denied=1');
  return user;
}

/**
 * Whether this user may see cost price, margin and lifetime value.
 *
 * The PRD marks lifetime value "admin/accounting only", and cost price is
 * hidden from client documents; reservations staff have no need for either.
 */
export function canSeeFinancials(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT';
}

/** Whether this user may manage staff accounts and system settings. */
export function canManageSettings(role: UserRole): boolean {
  return role === 'ADMIN';
}

/** Throwing variant for server actions, which cannot redirect mid-mutation. */
export async function assertRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error('You must be signed in to do that.');
  if (!roles.includes(user.role)) {
    throw new Error('You do not have permission to do that.');
  }
  return user;
}
