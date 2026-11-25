import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCESS_EXPECTATIONS,
  DATA_SETS,
  DERIVED_FUNCTIONS,
  FIXTURE_USERS,
  MONEY_FUNCTIONS,
  type DataSetOrFn,
} from '@erp/shared/access';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';
import {
  assertExpectation,
  assertWrite,
  defaultWriteSample,
  isRefusal,
  probeRead,
  probeWrite,
  type ProbeContext,
} from './run-matrix.js';

/**
 * Direct-query access matrix (FR-034, SC-001; tasks T024).
 *
 * Every fixture user × every data set and derived function, each queried with
 * the user's own session and compared with ACCESS_EXPECTATIONS (contracts/
 * access-matrix.md). Must FAIL before 0038/0039 and pass after them.
 *
 * Order matters: all reads run before any write probe, because write probes
 * add rows (students, payments) that a `scoped` read would count.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

const NO_READ_PROBE = new Set<string>([...MONEY_FUNCTIONS, 'topup_sms_credit']);
const TARGETS: DataSetOrFn[] = [...DATA_SETS, ...DERIVED_FUNCTIONS];

d('access matrix: direct queries', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;
  const ctx = (user: (typeof FIXTURE_USERS)[number]): ProbeContext => ({ fx, user, service });

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  // ── 1. Reads: the full matrix ───────────────────────────────────────────
  describe.each(FIXTURE_USERS)('reads as %s', (user) => {
    it.each(TARGETS.filter((t) => !NO_READ_PROBE.has(t)))('%s', async (target) => {
      const result = await probeRead(fx.users[user].client, target, ctx(user));
      await assertExpectation(result, ACCESS_EXPECTATIONS[user][target], ctx(user), target);
    });
  });

  // ── 2. Named spec cases ────────────────────────────────────────────────
  describe('named cases', () => {
    it('US1-1: teacher → money_event returns 0 rows and reveals nothing', async () => {
      const { data, error } = await fx.users.teacher.client.from('money_event').select('*');
      expect(data ?? []).toHaveLength(0);
      if (error) {
        expect(error.message).not.toContain('money_event');
        expect(error.message).not.toContain(fx.payments.X.moneyEventId);
      }
    });

    it.each([
      ['student_statement', { p_student_id: 'X' }],
      ['receivables_aging', { p_school_id: 'A' }],
      ['dashboard_kpis', { p_school_id: 'A' }],
      ['account_balance', { p_account_id: 'acc' }],
      ['student_balance', { p_student_id: 'X' }],
      ['student_financial_summary', { p_student_id: 'X' }],
    ] as const)('US1-2: teacher → %s is refused', async (fn, shape) => {
      const args: Record<string, string> = {};
      for (const [k, v] of Object.entries(shape)) {
        args[k] = v === 'X' ? fx.students.X : v === 'A' ? fx.schoolA : fx.accounts.A;
      }
      const { data, error } = await fx.users.teacher.client.rpc(fn, args);
      expect(isRefusal(error), `${fn}: ${JSON.stringify(error)} / ${JSON.stringify(data)}`).toBe(
        true,
      );
    });

    it('US1-3: student affairs → student_directory has identity fields, finance columns NULL', async () => {
      const { data, error } = await fx.users.sa.client.rpc('student_directory', {
        p_school_id: fx.schoolA,
      });
      expect(error).toBeNull();
      const rows = (data ?? []) as Record<string, unknown>[];
      expect(rows.length).toBe(3);
      for (const r of rows) {
        expect(r.name).toBeTruthy();
        expect(r.guardian_name).toBeTruthy();
        for (const col of [
          'total_charged',
          'total_paid',
          'total_owed',
          'overdue_amount',
          'next_due_amount',
        ])
          expect(r[col], col).toBeNull();
        expect(r.fin_status ?? null).toBeNull();
      }
    });

    it.each(['student', 'section', 'enrollment', 'academic_year'] as const)(
      'US1-4: teacher → %s returns 0 rows',
      async (table) => {
        const { data } = await fx.users.teacher.client.from(table).select('id');
        expect(data ?? []).toHaveLength(0);
      },
    );

    it.each(FIXTURE_USERS.filter((u) => u !== 'adminB' && u !== 'superAdmin'))(
      'US1-5: %s sees no School B row',
      async (user) => {
        const c = fx.users[user].client;
        for (const table of ['student', 'money_event', 'installment', 'account', 'user'] as const) {
          const { data } = await c.from(table).select('school_id').eq('school_id', fx.schoolB);
          expect(data ?? [], `${user} → ${table}`).toHaveLength(0);
        }
      },
    );

    it('principal → dashboard_kpis returns the totals subset only', async () => {
      const { data, error } = await fx.users.principal.client.rpc('dashboard_kpis', {
        p_school_id: fx.schoolA,
      });
      expect(error).toBeNull();
      expect(Object.keys(data as object).sort()).toEqual(
        [
          'collected_month',
          'collected_year',
          'collection_rate',
          'outstanding',
          'overdue_count',
        ].sort(),
      );
    });

    it('principalPrimary cannot see Y (Middle); Z (withdrawn) only for school-wide roles', async () => {
      const { data: pp } = await fx.users.principalPrimary.client.from('student').select('id');
      const ppIds = (pp ?? []).map((r) => r.id);
      expect(ppIds).toContain(fx.students.X);
      expect(ppIds).not.toContain(fx.students.Y);
      expect(ppIds).not.toContain(fx.students.Z);
      const { data: p } = await fx.users.principal.client.from('student').select('id');
      expect((p ?? []).map((r) => r.id)).toContain(fx.students.Z);
    });

    // Cross-school (0032a must not regress after 0039): School B ids as each School A role.
    it.each(FIXTURE_USERS.filter((u) => u !== 'adminB' && u !== 'superAdmin'))(
      '%s passing School B ids is refused',
      async (user) => {
        const c = fx.users[user].client;
        const calls: [string, Record<string, unknown>][] = [
          ['dashboard_kpis', { p_school_id: fx.schoolB }],
          ['receivables_aging', { p_school_id: fx.schoolB }],
          ['student_statement', { p_student_id: fx.students.B }],
          ['student_balance', { p_student_id: fx.students.B }],
          ['account_balance', { p_account_id: fx.accounts.B }],
          ['installment_running_balance', { p_installment_id: fx.installments.B[0] }],
          ['sms_credit_balance', { p_school_id: fx.schoolB }],
        ];
        for (const [fn, args] of calls) {
          const { error } = await c.rpc(fn, args);
          expect(isRefusal(error), `${user} → ${fn}(B): ${JSON.stringify(error)}`).toBe(true);
        }
      },
    );

    it('anon is refused every finance function', async () => {
      const anon: SupabaseClient = createClient(
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      for (const [fn, args] of [
        ['dashboard_kpis', { p_school_id: fx.schoolA }],
        ['student_statement', { p_student_id: fx.students.X }],
        ['receivables_aging', { p_school_id: fx.schoolA }],
        ['sms_credit_balance', { p_school_id: fx.schoolA }],
        ['my_access', {}],
      ] as const) {
        const { error } = await anon.rpc(fn, args);
        expect(error?.code, fn).toBe('42501');
      }
    });
  });

  // ── 3. Writes (after every read) ───────────────────────────────────────
  describe.each(FIXTURE_USERS)('writes as %s', (user) => {
    const targets = TARGETS.filter((t) => ACCESS_EXPECTATIONS[user][t].write !== undefined);
    it.each(targets)('%s', async (target) => {
      const want = ACCESS_EXPECTATIONS[user][target].write!;
      const sample = await defaultWriteSample(target, ctx(user), want === 'allowed');
      if (!sample) return; // no row of this kind for the caller's school
      const result = await probeWrite(fx.users[user].client, target, sample, service);
      assertWrite(result, want, `${user} → ${target}`);
    });
  });

  it('viewer → apply_fee_payment is refused (Phase 1 gap, research R0)', async () => {
    const { error } = await fx.users.viewer.client.rpc('apply_fee_payment', {
      p_student_id: fx.students.X,
      p_account_id: fx.accounts.A,
      p_amount: 1,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(isRefusal(error), JSON.stringify(error)).toBe(true);
  });
});
