import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@erp/database/types';

/**
 * Supabase client for Server Components / Server Actions / Route Handlers.
 * Session-bound (RLS applies); the caller's school_id/role are resolved
 * server-side from the session — never trusted from the client (Article IV).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (read-only cookies) — safe to
            // ignore; the middleware refreshes the session cookie instead.
          }
        },
      },
    },
  );
}
