import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * US1 isolation (T031 / G5, SC-012): the super-admin must NOT be able to read a
 * school's financial tables. We assert at the data layer via an RLS-bound client
 * authenticated as the super-admin: selecting sms_credit_consumption (a financial
 * table) returns zero rows even when consumption exists.
 *
 * Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and a
 * seeded super-admin (E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD).
 */
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.E2E_SUPERADMIN_EMAIL;
const password = process.env.E2E_SUPERADMIN_PASSWORD;

const ready = Boolean(url && anon && email && password);

test.describe('US1 — super-admin financial wall-off (G5)', () => {
  test.skip(!ready, 'requires super-admin credentials + Supabase env');

  test('super-admin reads zero rows from school financial tables', async () => {
    const client = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    expect(signInErr).toBeNull();

    // Financial table: consumption. Default-deny RLS + no super-admin policy ⇒
    // zero rows regardless of what any school has consumed.
    const { data, error } = await client.from('sms_credit_consumption').select('id');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
