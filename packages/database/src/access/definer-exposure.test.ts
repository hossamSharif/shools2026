import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getServiceClient,
  createAuthedUser,
  INTEGRATION_ENV_READY,
  type AuthedUser,
} from '../test-helpers/supabase.js';
import {
  activateSchool,
  addInstallments,
  cleanupSchool,
  newAccount,
  newSchool,
  newStudent,
} from '../test-helpers/fees.js';

/**
 * Hotfix 0032a: Phase 1 SECURITY DEFINER exposure
 * (specs/002-role-access-control/contracts/rpc-contracts.md §E0, tasks T009).
 *
 * Proves three things, and must FAIL before 0032a is applied:
 *  1. anon cannot execute any finance definer function (PUBLIC/anon EXECUTE revoked);
 *  2. a signed-in user of School A gets FORBIDDEN_SCHOOL when passing School B ids,
 *     while the same calls with School A ids still return the Phase 1 results;
 *  3. authenticated cannot execute the internal-only functions
 *     (consume_sms_credit, check_low_sms_credit, generate_installments).
 *
 * Integration test (Article X): real Supabase, skips when env is unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

const PERMISSION_DENIED = '42501';

function anonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

function expectForbiddenSchool(error: { message?: string } | null): void {
  expect(error).not.toBeNull();
  expect(error!.message).toContain('FORBIDDEN_SCHOOL');
}

d('hotfix 0032a: definer exposure', () => {
  const service = getServiceClient()!;
  const anon = anonClient();

  let schoolA: string;
  let schoolB: string;
  let accountantA: AuthedUser;
  let accountA: string;
  let accountB: string;
  let studentA: string;
  let studentB: string;
  let installmentA: string;
  let installmentB: string;

  beforeAll(async () => {
    schoolA = await newSchool(service, 'exposureA');
    schoolB = await newSchool(service, 'exposureB');
    await activateSchool(service, schoolA);
    await activateSchool(service, schoolB);
    accountantA = await createAuthedUser(service, 'accountant', schoolA);

    accountA = await newAccount(service, schoolA, 100);
    accountB = await newAccount(service, schoolB, 900);
    studentA = await newStudent(service, schoolA, 'ExposureA');
    studentB = await newStudent(service, schoolB, 'ExposureB');
    const today = new Date().toISOString().slice(0, 10);
    [installmentA] = await addInstallments(service, schoolA, studentA, [
      { sequence: 1, due_date: today, amount: 300 },
    ]);
    [installmentB] = await addInstallments(service, schoolB, studentB, [
      { sequence: 1, due_date: today, amount: 700 },
    ]);
  });

  afterAll(async () => {
    await accountantA?.cleanup();
    await cleanupSchool(service, schoolA);
    await cleanupSchool(service, schoolB);
  });

  describe('anon cannot execute finance definer functions', () => {
    const calls: [string, Record<string, unknown>][] = [
      ['dashboard_kpis', { p_school_id: '00000000-0000-0000-0000-000000000000' }],
      ['student_statement', { p_student_id: '00000000-0000-0000-0000-000000000000' }],
      ['receivables_aging', { p_school_id: '00000000-0000-0000-0000-000000000000' }],
      ['sms_credit_balance', { p_school_id: '00000000-0000-0000-0000-000000000000' }],
      [
        'consume_sms_credit',
        {
          p_school_id: '00000000-0000-0000-0000-000000000000',
          p_sms_message_id: '00000000-0000-0000-0000-000000000000',
          p_segments: 1,
          p_idempotency_key: '00000000-0000-0000-0000-000000000000',
        },
      ],
      ['mark_notification_read', { p_notification_id: null }],
    ];

    it.each(calls)('%s is refused for anon', async (fn, args) => {
      const { error } = await anon.rpc(fn as never, args as never);
      expect(error).not.toBeNull();
      expect(error!.code).toBe(PERMISSION_DENIED);
    });
  });

  describe('School A user passing School B ids gets FORBIDDEN_SCHOOL', () => {
    it('dashboard_kpis(B)', async () => {
      const { error } = await accountantA.client.rpc('dashboard_kpis', { p_school_id: schoolB });
      expectForbiddenSchool(error);
    });

    it('receivables_aging(B)', async () => {
      const { error } = await accountantA.client.rpc('receivables_aging', { p_school_id: schoolB });
      expectForbiddenSchool(error);
    });

    it('student_statement(B student)', async () => {
      const { error } = await accountantA.client.rpc('student_statement', {
        p_student_id: studentB,
      });
      expectForbiddenSchool(error);
    });

    it('account_balance(B account)', async () => {
      const { error } = await accountantA.client.rpc('account_balance', {
        p_account_id: accountB,
      });
      expectForbiddenSchool(error);
    });

    it('student_balance(B student)', async () => {
      const { error } = await accountantA.client.rpc('student_balance', {
        p_student_id: studentB,
      });
      expectForbiddenSchool(error);
    });

    it('installment_running_balance(B installment)', async () => {
      const { error } = await accountantA.client.rpc('installment_running_balance', {
        p_installment_id: installmentB,
      });
      expectForbiddenSchool(error);
    });

    it('sms_credit_balance(B)', async () => {
      const { error } = await accountantA.client.rpc('sms_credit_balance', {
        p_school_id: schoolB,
      });
      expectForbiddenSchool(error);
    });
  });

  describe('same-school calls are unchanged', () => {
    it('balance helpers return the derived values', async () => {
      const acc = await accountantA.client.rpc('account_balance', { p_account_id: accountA });
      expect(acc.error).toBeNull();
      expect(Number(acc.data)).toBe(100);

      const stu = await accountantA.client.rpc('student_balance', { p_student_id: studentA });
      expect(stu.error).toBeNull();
      expect(Number(stu.data)).toBe(300);

      const inst = await accountantA.client.rpc('installment_running_balance', {
        p_installment_id: installmentA,
      });
      expect(inst.error).toBeNull();
      expect(Number(inst.data)).toBe(300);
    });

    it('statement, aging, dashboard and credit balance return data', async () => {
      const st = await accountantA.client.rpc('student_statement', { p_student_id: studentA });
      expect(st.error).toBeNull();
      expect((st.data as unknown[]).length).toBe(1);

      const ag = await accountantA.client.rpc('receivables_aging', { p_school_id: schoolA });
      expect(ag.error).toBeNull();
      expect((ag.data as { student_id: string }[]).map((r) => r.student_id)).toContain(studentA);

      const kp = await accountantA.client.rpc('dashboard_kpis', { p_school_id: schoolA });
      expect(kp.error).toBeNull();
      expect(kp.data).toHaveProperty('outstanding');

      const cr = await accountantA.client.rpc('sms_credit_balance', { p_school_id: schoolA });
      expect(cr.error).toBeNull();
      expect(Number(cr.data)).toBe(0);
    });

    it('an unknown id still returns the Phase 1 empty result, not an error', async () => {
      const missing = '00000000-0000-0000-0000-000000000000';
      const acc = await accountantA.client.rpc('account_balance', { p_account_id: missing });
      expect(acc.error).toBeNull();
      expect(acc.data).toBeNull();
    });

    it('the service role (worker) still reads any school', async () => {
      const { error } = await service.rpc('dashboard_kpis', { p_school_id: schoolB });
      expect(error).toBeNull();
    });
  });

  describe('internal-only functions are not executable by authenticated', () => {
    const calls: [string, Record<string, unknown>][] = [
      [
        'consume_sms_credit',
        {
          p_school_id: '00000000-0000-0000-0000-000000000000',
          p_sms_message_id: '00000000-0000-0000-0000-000000000000',
          p_segments: 1,
          p_idempotency_key: '00000000-0000-0000-0000-000000000000',
        },
      ],
      ['check_low_sms_credit', { p_school_id: '00000000-0000-0000-0000-000000000000' }],
      ['generate_installments', { p_enrollment_id: '00000000-0000-0000-0000-000000000000' }],
    ];

    it.each(calls)('%s is refused for an authenticated school user', async (fn, args) => {
      const { error } = await accountantA.client.rpc(fn as never, args as never);
      expect(error).not.toBeNull();
      expect(error!.code).toBe(PERMISSION_DENIED);
    });

    it('the enrollment trigger still generates installments', async () => {
      const { data: year, error: yErr } = await service
        .from('academic_year')
        .insert({
          school_id: schoolA,
          label: `y-${Date.now()}`,
          is_current: false,
        })
        .select('id')
        .single();
      expect(yErr).toBeNull();
      const { data: grade } = await service.from('grade').select('id').limit(1).single();
      const { data: section } = await service
        .from('section')
        .insert({ school_id: schoolA, grade_id: grade!.id, name: `s-${Date.now()}` })
        .select('id')
        .single();
      const { data: fs } = await service
        .from('fee_structure')
        .insert({ school_id: schoolA, grade_id: grade!.id, academic_year_id: year!.id })
        .select('id')
        .single();
      await service.from('installment_schedule').insert({
        school_id: schoolA,
        fee_structure_id: fs!.id,
        sequence: 1,
        due_date: '2026-10-01',
        amount: 250,
      });

      const enrolled = await newStudent(service, schoolA, 'TriggerStudent');
      const { error: enrErr } = await accountantA.client.from('enrollment').insert({
        school_id: schoolA,
        student_id: enrolled,
        grade_id: grade!.id,
        section_id: section!.id,
        academic_year_id: year!.id,
      });
      expect(enrErr).toBeNull();

      const { data: inst } = await service
        .from('installment')
        .select('amount_charged')
        .eq('student_id', enrolled);
      expect((inst ?? []).map((r) => Number(r.amount_charged))).toEqual([250]);
    });
  });
});
