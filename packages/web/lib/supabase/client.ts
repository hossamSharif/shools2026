'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@erp/database/types';

/** Supabase client for Client Components (RLS-bound anon key). */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
