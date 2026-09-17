import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { signOut } from '@/server/auth';
import { requireUser } from '@/server/guards';
import { MobileNav, Nav } from '@/components/nav';
import { Badge } from '@/components/ui';
import { humanise } from '@/components/status';

/**
 * Shell for every signed-in page.
 *
 * `requireUser` runs here, so every route in this group is authenticated by
 * construction; individual pages add role checks on top where they need them.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function endSession() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="px-5 py-5">
            <Link href="/dashboard" className="block">
              <p className="text-xl font-semibold tracking-tight text-voya-700">VOYA</p>
              <p className="text-[10px] tracking-[0.2em] text-voya-400 uppercase">
                Travel &amp; Tourism
              </p>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto px-3">
            <Nav role={user.role} />
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 px-2">
              <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
              <p className="mt-0.5">
                <Badge tone={user.role === 'ADMIN' ? 'info' : 'neutral'}>
                  {humanise(user.role)}
                </Badge>
              </p>
            </div>
            <form action={endSession}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <MobileNav role={user.role} />
            <span className="text-lg font-semibold text-voya-700">VOYA</span>
          </div>
          <form action={endSession}>
            <button
              type="submit"
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" aria-hidden />
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
