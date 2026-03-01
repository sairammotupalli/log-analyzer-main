// ─── Server-side API Client ───────────────────────────────────────────────────
// Use in Server Components and Server Actions via auth() session.
// For Client Components, use the token from useSession() directly.

import { auth } from '@/lib/auth';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:4000';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await auth();
  const token   = session?.backendToken;

  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `API ${res.status}`);
  }
  return body as T;
}

export const api = {
  get:    <T>(path: string)                      => request<T>(path),
  post:   <T>(path: string, data: unknown)       => request<T>(path, { method: 'POST',   body: JSON.stringify(data) }),
  put:    <T>(path: string, data: unknown)       => request<T>(path, { method: 'PUT',    body: JSON.stringify(data) }),
  delete: <T>(path: string)                      => request<T>(path, { method: 'DELETE' }),
};

// ─── Client-side helper ───────────────────────────────────────────────────────
// Pass the backendToken from useSession() to create a typed fetch function.

const BACKEND_PUBLIC = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export function makeClientApi(token: string) {
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
  };

  async function clientRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BACKEND_PUBLIC}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as any)?.error?.message ?? `API ${res.status}`);
    }
    return body as T;
  }

  return {
    get:    <T>(path: string)                 => clientRequest<T>(path),
    post:   <T>(path: string, data: unknown)  => clientRequest<T>(path, { method: 'POST', body: JSON.stringify(data) }),
    put:    <T>(path: string, data: unknown)  => clientRequest<T>(path, { method: 'PUT',  body: JSON.stringify(data) }),
    delete: <T>(path: string)                 => clientRequest<T>(path, { method: 'DELETE' }),
  };
}
