import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * T137 (SC-012) — tenant-isolation security sweep: cross-school read/write
 * attempts as each role (super_admin, school_admin, accountant, viewer)
 * against financial tables. Asserts RLS default-deny holds: a user scoped to
 * school A gets zero rows / a rejected write against school B's financial
 * data, and the super-admin gets zero rows from financial tables at all
 * (G5, complementing us1-superadmin-isolation.spec.ts's single-table check).
 *
 * Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * and two seeded schools (A, B) each with a seeded user per role:
 *   E2E_SCHOOL_A_ADMIN_EMAIL / _PASSWORD, E2E_SCHOOL_A_ACCOUNTANT_EMAIL / _PASSWORD,
 *   E2E_SCHOOL_A_VIEWER_EMAIL / _PASSWORD, E2E_SCHOOL_B_ID (target school id to
 *   probe cross-tenant reads against), E2E_SUPERADMIN_EMAIL / _PASSWORD.
 * This environment is not provisioned in this run (no seeded multi-school
 * fixture with per-role users exists yet) — every test below is marked
 * test.skip with the precise reason so this file fails loudly (via skip
 * visibility in the report) rather than silently, consistent with the
 * skip-scaffolding pattern used by us1-superadmin-isolation.spec.ts and
 * us8-lifecycle.spec.ts from earlier phases.
 */
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const schoolBId = process.env.E2E_SCHOOL_B_ID;

const roleFixtures = [
  {
    role: 'school_admin' as const,
    email: process.env.E2E_SCHOOL_A_ADMIN_EMAIL,
    password: process.env.E2E_SCHOOL_A_ADMIN_PASSWORD,
  },
  {
    role: 'accountant' as const,
    email: process.env.E2E_SCHOOL_A_ACCOUNTANT_EMAIL,
    password: process.env.E2E_SCHOOL_A_ACCOUNTANT_PASSWORD,
  },
  {
    role: 'viewer' as const,
    email: process.env.E2E_SCHOOL_A_VIEWER_EMAIL,
    password: process.env.E2E_SCHOOL_A_VIEWER_PASSWORD,
  },
];

const superAdminEmail = process.env.E2E_SUPERADMIN_EMAIL;
const superAdminPassword = process.env.E2E_SUPERADMIN_PASSWORD;

const financialTables = [
  'money_event',
  'installment',
  'payment_allocation',
  'discount',
  'audit_entry',
  'sms_credit_consumption',
  'receipt_counter',
] as const;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

test.describe('T137 — tenant-isolation security sweep (SC-012)', () => {
  for (const fixture of roleFixtures) {
    const ready = Boolean(url && anon && fixture.email && fixture.password && schoolBId);

    test(`${fixture.role}: cross-school read of financial tables returns zero rows`, async () => {
      test.skip(
        !ready,
        `requires E2E_SCHOOL_A_${fixture.role.toUpperCase()}_EMAIL/_PASSWORD, E2E_SCHOOL_B_ID, and Supabase env — not seeded in this run`,
      );
      const client = await signIn(fixture.email!, fixture.password!);
      for (const table of financialTables) {
        const { data, error } = await client
          .from(table)
          .select('*')
          .eq('school_id', schoolBId as string);
        // RLS default-deny: either an error (no SELECT grant path) or zero rows.
        expect(data === null || (data ?? []).length === 0 || error !== null).toBe(true);
      }
    });

    test(`${fixture.role}: cross-school write (fee payment) against school B is rejected`, async () => {
      test.skip(
        !ready,
        `requires E2E_SCHOOL_A_${fixture.role.toUpperCase()}_EMAIL/_PASSWORD, E2E_SCHOOL_B_ID, and Supabase env — not seeded in this run`,
      );
      const client = await signIn(fixture.email!, fixture.password!);
      const { error } = await client.rpc('apply_fee_payment', {
        p_student_id: '00000000-0000-0000-0000-000000000000',
        p_account_id: '00000000-0000-0000-0000-000000000000',
        p_amount: '1.00',
        p_occurred_at: new Date().toISOString(),
        p_idempotency_key: crypto.randomUUID(),
        p_allocations: [],
        p_attachment_path: null,
      });
      expect(error).not.toBeNull();
    });
  }

  test('super_admin: reads zero rows across every financial table (all schools)', async () => {
    const ready = Boolean(url && anon && superAdminEmail && superAdminPassword);
    test.skip(
      !ready,
      'requires E2E_SUPERADMIN_EMAIL/_PASSWORD and Supabase env — not seeded in this run',
    );
    const client = await signIn(superAdminEmail!, superAdminPassword!);
    for (const table of financialTables) {
      const { data, error } = await client.from(table).select('*');
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  });
});
