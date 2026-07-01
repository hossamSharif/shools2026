import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client for integration tests (Article X). Bypasses RLS so tests
 * can arrange tenant data across schools. Reads SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY from the environment; skips gracefully when unset.
 */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const INTEGRATION_ENV_READY = Boolean(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);
