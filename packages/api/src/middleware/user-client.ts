import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import type { Database } from '@erp/database/types';

/**
 * User-scoped Supabase client (spec 002, contracts/worker-endpoints.md).
 *
 * The worker holds the service key, but authorization decisions must be made
 * by Postgres AS THE REQUESTING USER. The web server action forwards the
 * user's access token in `x-user-jwt`; this client sends it as the bearer, so
 * RLS, auth.uid() and has_perm() evaluate for that user. It never sees the
 * service key.
 */
export function createUserScopedClient(jwt: string): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY must be set for user-scoped calls');
  }
  return createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/** Requires the `x-user-jwt` header; 401 when it is missing or blank. */
export function requireUserJwt(req: Request, res: Response, next: NextFunction): void {
  const jwt = req.header('x-user-jwt');
  if (!jwt || jwt.trim() === '') {
    res.status(401).json({ error: 'USER_JWT_REQUIRED' });
    return;
  }
  res.locals.userJwt = jwt.trim();
  next();
}

/** Maps a Postgres refusal (`FORBIDDEN_*`, Arabic hint) to its error code, or null. */
export function forbiddenCode(error: { message?: string } | null | undefined): string | null {
  const m = error?.message?.match(/^(FORBIDDEN_[A-Z_]+)/);
  return m?.[1] ?? null;
}
