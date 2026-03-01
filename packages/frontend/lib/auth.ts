import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

// ─── Type Augmentation ────────────────────────────────────────────────────────

declare module 'next-auth' {
  interface Session {
    backendToken: string;
    user: {
      id: string;
    } & DefaultSession['user'];
  }

  interface User {
    backendToken?: string;
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
// Note: JWT already extends Record<string, unknown> in next-auth v5, so
// extra fields (userId, backendToken) are stored without augmentation.

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:    process.env.NEXTAUTH_SECRET,
  trustHost: true,

  providers: [
    // ── Email / Password ──────────────────────────────────────────────────
    Credentials({
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              email:    credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const { data } = await res.json();
          return {
            id:           data.user.id,
            name:         data.user.name,
            email:        data.user.email,
            backendToken: data.token,
          };
        } catch {
          return null;
        }
      },
    }),

    // ── Google OAuth ──────────────────────────────────────────────────────
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: { strategy: 'jwt' },

  callbacks: {
    // Runs on every sign-in and every JWT refresh
    async jwt({ token, user, account }) {
      // Credentials sign-in: user object carries backendToken
      if (user?.backendToken) {
        token.backendToken = user.backendToken;
        token.userId       = user.id;
      }

      // Google sign-in: sync with backend to get a backend JWT
      if (account?.provider === 'google' && token.email) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/oauth`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email: token.email, name: token.name }),
          });
          if (res.ok) {
            const { data } = await res.json();
            token.backendToken = data.token;
            token.userId       = data.user.id;
          }
        } catch {
          // Non-fatal — user is logged in via Google but backend API calls will fail auth
          console.warn('[auth] Google OAuth backend sync failed');
        }
      }

      return token;
    },

    // Exposes userId and backendToken on the client-visible session
    async session({ session, token }) {
      session.backendToken = (token.backendToken as string) ?? '';
      session.user.id      = (token.userId      as string) ?? '';
      return session;
    },
  },
});
