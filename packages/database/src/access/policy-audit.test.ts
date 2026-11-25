import { describe, expect, it } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';

/**
 * Automated policy audit (FR-035, SC-002; tasks T026). A required gate: any
 * tenant table without forced RLS, any signed-in-only policy, any policy that
 * authorizes on user.role, any unreviewed definer function exposed to
 * authenticated, and any definer function anon can execute fails this test.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('audit_access_policies()', () => {
  const service = getServiceClient()!;

  it('reports zero violations', async () => {
    const { data, error } = await service.rpc('audit_access_policies');
    expect(error).toBeNull();
    expect(data ?? [], JSON.stringify(data, null, 2)).toEqual([]);
  });

  it('is not executable by a signed-in or anonymous client', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await anon.rpc('audit_access_policies');
    expect(error?.code).toBe('42501');
  });
});

/**
 * Negative test: proves the audit actually catches a signed-in-only policy.
 * It creates a throw-away table, so it runs only against a Supabase BRANCH
 * whose service role may run DDL through the `exec_branch_sql` helper
 * (set POLICY_AUDIT_NEGATIVE=1 on a branch only; never on production).
 */
describe.skipIf(!process.env.POLICY_AUDIT_NEGATIVE || !INTEGRATION_ENV_READY)(
  'audit_access_policies() negative (branch only)',
  () => {
    const service = getServiceClient()!;
    it('flags signed_in_only_policy', async () => {
      const ddl = `
        create table public.zz_audit_probe (id uuid primary key default gen_random_uuid(), school_id uuid not null);
        alter table public.zz_audit_probe enable row level security;
        alter table public.zz_audit_probe force row level security;
        create policy zz_probe on public.zz_audit_probe for select to authenticated
          using (school_id = public.current_school_id());`;
      const { error: ddlErr } = await service.rpc('exec_branch_sql', { p_sql: ddl });
      expect(ddlErr).toBeNull();
      try {
        const { data } = await service.rpc('audit_access_policies');
        const rows = (data ?? []) as { object: string; kind: string }[];
        expect(
          rows.some(
            (r) => r.object.includes('zz_audit_probe') && r.kind === 'signed_in_only_policy',
          ),
        ).toBe(true);
      } finally {
        await service.rpc('exec_branch_sql', {
          p_sql: 'drop table if exists public.zz_audit_probe',
        });
      }
    });
  },
);
