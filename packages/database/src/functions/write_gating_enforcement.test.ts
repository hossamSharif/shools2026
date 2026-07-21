import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
 * T125 (US8, SC-009): every money/credit RPC must reject with WRITES_GATED when
 * the school is not 'active' (grace or locked), and reads/exports must still
 * succeed regardless of lifecycle state. The DB is the sole authority for
 * write-gating (Article IV) — this suite drives each RPC directly.
 *
 * Integration test (Article X): requires 0001-0016 + money functions applied.
 * Skips when env is unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

async function lockSchool(service: ReturnType<typeof getServiceClient> & object, schoolId: string) {
  await service.from('subscription').delete().eq('school_id', schoolId);
  const past = new Date();
  past.setFullYear(past.getFullYear() - 2);
  const end = new Date();
  end.setDate(end.getDate() - 60); // well past any grace window
  const { error } = await service.from('subscription').insert({
    school_id: schoolId,
    period_start: past.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    grace_days: 14,
  });
  if (error) throw error;
}

d('write-gating enforcement across money RPCs (SC-009)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;
  let accountId: string;
  let accountId2: string;
  let studentId: string;
  let installmentId: string;
  let eventId: string;

  beforeAll(async () => {
    schoolId = await newSchool(service, 'wgate');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
    accountId = await newAccount(service, schoolId, 0);
    accountId2 = await newAccount(service, schoolId, 0);
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  beforeEach(async () => {
    // Reset to active, create a fresh student+installment, post one payment
    // (while active) so reversal/refund/discount targets exist.
    await activateSchool(service, schoolId);
    studentId = await newStudent(service, schoolId, `Payer-${Date.now()}`);
    [installmentId] = await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 500 },
    ]);
    const { data, error } = await accountant.client.rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: 100,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: null,
      p_attachment_path: null,
    });
    if (error) throw error;
    eventId = (data as unknown as { money_event_id: string }).money_event_id;
  });

  const gatedCases: { name: string; call: () => Promise<{ error: unknown }> }[] = [
    {
      name: 'apply_fee_payment',
      call: () =>
        accountant.client.rpc('apply_fee_payment', {
          p_student_id: studentId,
          p_account_id: accountId,
          p_amount: 50,
          p_occurred_at: new Date().toISOString(),
          p_idempotency_key: crypto.randomUUID(),
          p_allocations: null,
          p_attachment_path: null,
        }),
    },
    {
      name: 'record_expense',
      call: () =>
        accountant.client.rpc('record_expense', {
          p_account_id: accountId,
          p_amount: 10,
          p_category: 'supplies',
          p_occurred_at: new Date().toISOString(),
          p_idempotency_key: crypto.randomUUID(),
        }),
    },
    {
      name: 'record_transfer',
      call: () =>
        accountant.client.rpc('record_transfer', {
          p_from_account_id: accountId,
          p_to_account_id: accountId2,
          p_amount: 10,
          p_occurred_at: new Date().toISOString(),
          p_idempotency_key: crypto.randomUUID(),
        }),
    },
    {
      name: 'record_refund',
      call: () =>
        accountant.client.rpc('record_refund', {
          p_student_id: studentId,
          p_account_id: accountId,
          p_amount: 10,
          p_occurred_at: new Date().toISOString(),
          p_idempotency_key: crypto.randomUUID(),
        }),
    },
    {
      name: 'record_adjustment',
      call: () =>
        accountant.client.rpc('record_adjustment', {
          p_student_id: studentId,
          p_amount: 10,
          p_reason: 'test write-off',
          p_occurred_at: new Date().toISOString(),
          p_idempotency_key: crypto.randomUUID(),
        }),
    },
    {
      name: 'apply_discount',
      call: () =>
        accountant.client.rpc('apply_discount', {
          p_student_id: studentId,
          p_kind: 'fixed',
          p_value: 10,
          p_idempotency_key: crypto.randomUUID(),
        }),
    },
    {
      name: 'reverse_event',
      call: () =>
        accountant.client.rpc('reverse_event', {
          p_money_event_id: eventId,
          p_reason: 'test reversal',
          p_idempotency_key: crypto.randomUUID(),
        }),
    },
  ];

  for (const { name, call } of gatedCases) {
    it(`${name} rejects with WRITES_GATED when locked`, async () => {
      await lockSchool(service, schoolId);
      const { error } = await call();
      expect(error).toBeTruthy();
      expect(String((error as { message?: string })?.message ?? error)).toContain('WRITES_GATED');
    });
  }

  it('reads/exports still succeed while locked (SC-009)', async () => {
    await lockSchool(service, schoolId);

    const { error: eventsErr } = await accountant.client
      .from('money_event')
      .select('id')
      .eq('school_id', schoolId);
    expect(eventsErr).toBeNull();

    const { error: installmentErr } = await accountant.client
      .from('installment')
      .select('id')
      .eq('school_id', schoolId);
    expect(installmentErr).toBeNull();
  });
});
