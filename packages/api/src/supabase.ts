import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@erp/database/types';

/**
 * Worker-side Supabase client (service role). The worker is a trusted system
 * process (Article VI) — it calls SECURITY DEFINER money/credit functions
 * directly with explicit school_id args rather than relying on a user JWT.
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set for @erp/api');
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
