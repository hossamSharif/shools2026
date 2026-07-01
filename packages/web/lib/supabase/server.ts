import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@erp/database/types';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase client for Server Components / Server Actions / Route Handlers.
 * Session-bound (RLS applies); the caller's school_id/role are resolved
 * server-side from the session — never trusted from the client (Article IV).
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  const cookieStore = cookies();

  // `@supabase/ssr` types its client against a slightly older supabase-js
  // client shape than the pinned `@supabase/supabase-js`; both are the same
  // runtime object, so bridge the type to the canonical SupabaseClient<Database>
  // (keeps `.from()`/`.rpc()` fully typed for callers).
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
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
  ) as unknown as SupabaseClient<Database>;
}
