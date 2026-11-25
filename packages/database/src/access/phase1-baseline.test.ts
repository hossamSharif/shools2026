import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';
import { isRefusal } from './run-matrix.js';

/**
 * Existing finance users notice no change (US2-1..3, FR-003/005/024, T035).
 * school_admin, accountant and viewer read exactly the rows a service-role
 * read of School A returns; the accountant keeps every Phase 1 write; the
 * viewer is refused every write; the super-admin stays walled off from
 * finance and keeps its directory powers.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

const PHASE1_TABLES = [
  'school',
  'subscription',
  'academic_year',
  'section',
  'student',
  'enrollment',
  'account',
  'fee_structure',
  'fee_item',
  'installment_schedule',
  'reminder_rule',
  'installment',
  'money_event',
  'payment_allocation',
  'receipt_counter',
  'discount',
  'audit_entry',
  'sms_message_log',
  'sms_credit_topup',
  'sms_credit_consumption',
] as const;

const FINANCE_TABLES = [
  'account',
  'fee_structure',
  'fee_item',
  'installment_schedule',
  'reminder_rule',
  'installment',
  'money_event',
  'payment_allocation',
  'receipt_counter',
  'discount',
  'audit_entry',
  'sms_message_log',
  'sms_credit_consumption',
] as const;

const keyOf = (table: string) => (table === 'receipt_counter' ? 'school_id' : 'id');

d('Phase 1 baseline is unchanged', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);
  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  describe.each(['adminA', 'accountant', 'viewer'] as const)('%s: read parity', (user) => {
    it.each(PHASE1_TABLES)('%s returns the same rows as the service role', async (table) => {
      const k = keyOf(table);
      const col = table === 'school' ? 'id' : 'school_id';
      const { data: trusted, error: e1 } = await service.from(table).select(k).eq(col, fx.schoolA);
      expect(e1).toBeNull();
      const { data: mine, error: e2 } = await fx.users[user].client.from(table).select(k);
      expect(e2).toBeNull();
      const ids = (rows: unknown[] | null) =>
        (rows ?? []).map((r) => String((r as Record<string, unknown>)[k])).sort();
      expect(ids(mine)).toEqual(ids(trusted));
    });
  });

  describe('accountant keeps every Phase 1 write', () => {
    it('posts each money RPC', async () => {
      const c = fx.users.accountant.client;
      const now = new Date().toISOString();
      const calls: [string, Record<string, unknown>][] = [
        [
          'apply_fee_payment',
          {
            p_student_id: fx.students.X,
            p_account_id: fx.accounts.A,
            p_amount: 1,
            p_occurred_at: now,
            p_idempotency_key: crypto.randomUUID(),
          },
        ],
        [
          'record_expense',
          {
            p_account_id: fx.accounts.A,
            p_amount: 1,
            p_category: 'other',
            p_occurred_at: now,
            p_idempotency_key: crypto.randomUUID(),
          },
        ],
        [
          'record_transfer',
          {
            p_from_account_id: fx.accounts.A,
            p_to_account_id: fx.accounts.A2,
            p_amount: 1,
            p_occurred_at: now,
            p_idempotency_key: crypto.randomUUID(),
          },
        ],
        [
          'record_refund',
          {
            p_student_id: fx.students.X,
            p_account_id: fx.accounts.A,
            p_amount: 1,
            p_occurred_at: now,
            p_idempotency_key: crypto.randomUUID(),
          },
        ],
        [
          'record_adjustment',
          {
            p_student_id: fx.students.X,
            p_amount: 1,
            p_reason: 'baseline',
            p_occurred_at: now,
            p_idempotency_key: crypto.randomUUID(),
          },
        ],
        [
          'apply_discount',
          {
            p_student_id: fx.students.X,
            p_kind: 'fixed',
            p_value: 1,
            p_idempotency_key: crypto.randomUUID(),
          },
        ],
      ];
      for (const [fn, args] of calls) {
        const { error } = await c.rpc(fn, args);
        expect(error, fn).toBeNull();
      }
    });

    it('upserts a student, creates structure and finance setup, and enrolls', async () => {
      const c = fx.users.accountant.client;
      const { data: s, error: e1 } = await c
        .from('student')
        .insert({ school_id: fx.schoolA, name: 'baseline' })
        .select('id')
        .single();
      expect(e1).toBeNull();
      const { error: e2 } = await c.from('student').update({ name: 'baseline 2' }).eq('id', s!.id);
      expect(e2).toBeNull();
      const { error: e3 } = await c
        .from('academic_year')
        .insert({ school_id: fx.schoolA, label: `baseline-${Date.now()}` });
      expect(e3).toBeNull();
      const { data: g } = await service.from('grade').select('id').eq('code', 'p2').single();
      const { data: sec, error: e4 } = await c
        .from('section')
        .insert({ school_id: fx.schoolA, grade_id: g!.id, name: `b-${Date.now()}` })
        .select('id')
        .single();
      expect(e4).toBeNull();
      const { error: e5 } = await c
        .from('account')
        .insert({
          school_id: fx.schoolA,
          name: `b-${Date.now()}`,
          type: 'cash',
          opening_balance: 0,
        });
      expect(e5).toBeNull();
      const { error: e6 } = await c
        .from('fee_structure')
        .insert({ school_id: fx.schoolA, grade_id: g!.id, academic_year_id: fx.yearA });
      expect(e6).toBeNull();
      const { error: e7 } = await c.from('enrollment').insert({
        school_id: fx.schoolA,
        student_id: s!.id,
        grade_id: g!.id,
        section_id: sec!.id,
        academic_year_id: fx.yearA,
      });
      expect(e7).toBeNull();
    });
  });

  describe('viewer is refused every write', () => {
    it('money RPCs', async () => {
      const { error } = await fx.users.viewer.client.rpc('apply_fee_payment', {
        p_student_id: fx.students.X,
        p_account_id: fx.accounts.A,
        p_amount: 1,
        p_occurred_at: new Date().toISOString(),
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(isRefusal(error), JSON.stringify(error)).toBe(true);
    });

    it.each(['student', 'account', 'reminder_rule'] as const)(
      'direct insert into %s',
      async (table) => {
        const rows: Record<string, Record<string, unknown>> = {
          student: { school_id: fx.schoolA, name: 'viewer' },
          account: { school_id: fx.schoolA, name: 'viewer', type: 'cash', opening_balance: 0 },
          reminder_rule: { school_id: fx.schoolA, offset_kind: 'before', days: 1 },
        };
        const { error } = await fx.users.viewer.client.from(table).insert(rows[table]!);
        expect(isRefusal(error), JSON.stringify(error)).toBe(true);
      },
    );

    it('direct update of a student changes no row', async () => {
      const { data, error } = await fx.users.viewer.client
        .from('student')
        .update({ name: 'x' })
        .eq('id', fx.students.X)
        .select();
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe('super-admin (FR-024)', () => {
    it.each([...FINANCE_TABLES, 'access_audit_entry'] as const)(
      'reads 0 rows of %s',
      async (table) => {
        const { data } = await fx.users.superAdmin.client.from(table).select('school_id');
        expect(data ?? []).toHaveLength(0);
      },
    );

    it('still manages school, subscription and SMS top-ups', async () => {
      const c = fx.users.superAdmin.client;
      const { data: schools } = await c
        .from('school')
        .select('id')
        .in('id', [fx.schoolA, fx.schoolB]);
      expect((schools ?? []).length).toBe(2);
      const { data: subs } = await c
        .from('subscription')
        .update({ grace_days: 14 })
        .eq('school_id', fx.schoolA)
        .select();
      expect((subs ?? []).length).toBe(1);
      const { error } = await c.rpc('topup_sms_credit', {
        p_school_id: fx.schoolA,
        p_amount: 1,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(error).toBeNull();
    });
  });
});
