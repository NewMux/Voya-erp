import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/server/auth';
import { currentUser } from '@/server/guards';
import { Alert, Button, Field, Input } from '@/components/ui';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  // Already signed in: don't show a login form.
  if (await currentUser()) redirect('/dashboard');

  async function authenticate(formData: FormData) {
    'use server';

    const next = String(formData.get('next') ?? '/dashboard');

    try {
      await signIn('credentials', {
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        redirectTo: next.startsWith('/') ? next : '/dashboard',
      });
    } catch (error) {
      // next-auth signals a successful redirect by throwing; only a genuine
      // AuthError means the credentials were wrong.
      if (error instanceof AuthError) {
        redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ''}`);
      }
      throw error;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-voya-50 via-white to-voya-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-3xl font-semibold tracking-tight text-voya-700">VOYA</p>
          <p className="mt-1 text-sm tracking-[0.25em] text-voya-500 uppercase">
            Travel &amp; Tourism
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-medium text-voya-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Internal use only.</p>

          {params.error ? (
            <div className="mt-4">
              <Alert tone="danger">Incorrect email or password.</Alert>
            </div>
          ) : null}

          <form action={authenticate} className="mt-5 space-y-4">
            <input type="hidden" name="next" value={params.next ?? '/dashboard'} />

            <Field label="Email" required>
              <Input
                type="email"
                name="email"
                autoComplete="username"
                required
                placeholder="you@voyatravel.bh"
              />
            </Field>

            <Field label="Password" required>
              <Input type="password" name="password" autoComplete="current-password" required />
            </Field>

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Voya Travel &amp; Tourism · A&apos;ali, Bahrain
        </p>
      </div>
    </main>
  );
}
