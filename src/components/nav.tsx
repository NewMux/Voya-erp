'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Bell,
  Building2,
  CalendarRange,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Plane,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { UserRole } from '@prisma/client';
import { cn } from '@/lib/utils';

/**
 * Sidebar navigation.
 *
 * A client component only because it needs the current path for the active
 * state and local state for the mobile drawer. Role filtering is applied here
 * for tidiness, but every route still guards itself server-side — hiding a link
 * is not access control.
 */

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bookings', label: 'Bookings', icon: Plane },
  { href: '/group-trips', label: 'Group Adventures', icon: CalendarRange },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/memberships', label: 'Memberships', icon: CreditCard },
  { href: '/suppliers', label: 'Suppliers', icon: Building2 },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/payments', label: 'Payments', icon: Wallet, roles: ['ADMIN', 'ACCOUNTANT'] },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export function Nav({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        // Prefix match so a detail page keeps its section highlighted, with the
        // trailing slash preventing /bookings from matching /bookings-archive.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-voya-100 text-voya-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-semibold text-voya-700">VOYA</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <Nav role={role} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
