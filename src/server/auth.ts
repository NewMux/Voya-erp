import NextAuth, { type DefaultSession } from 'next-auth';
// Imported so the `declare module 'next-auth/jwt'` augmentation below can
// resolve the module; TypeScript cannot augment a module it has not loaded.
import type { JWT as _JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Authentication.
 *
 * Phase 1 uses email + password against the staff table. The full
 * HR/permissions module is Phase 2, so roles are a fixed enum here.
 *
 * Sessions are JWT-backed for speed, but `isActive` is re-read from the
 * database on every session callback — deactivating a user takes effect on
 * their next request rather than whenever their token happens to expire.
 */

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession['user'];
  }

  interface User {
    role: UserRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase().trim() },
        });

        // Compare against a dummy hash when the user does not exist, so the
        // response time does not reveal which emails are registered.
        const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
        const valid = await bcrypt.compare(parsed.data.password, hash);

        if (!user || !valid || !user.isActive) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        // Re-read the role and active flag so a demotion or deactivation is
        // picked up without waiting for the token to expire.
        const current = await prisma.user.findUnique({
          where: { id: token.id },
          select: { id: true, name: true, email: true, role: true, isActive: true },
        });

        if (!current || !current.isActive) {
          // Returning a session with no user id forces the middleware to treat
          // the request as signed out.
          return { ...session, user: { ...session.user, id: '', role: 'STAFF' } };
        }

        session.user.id = current.id;
        session.user.role = current.role;
        session.user.name = current.name;
        session.user.email = current.email;
      }
      return session;
    },
  },
});
