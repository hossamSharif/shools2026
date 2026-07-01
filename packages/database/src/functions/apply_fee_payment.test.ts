import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  createAuthedUser,
  INTEGRATION_ENV_READY,
  type AuthedUser,
} from '../test-helpers/supabase.js';
import {
  activateSchool,
  addInstallments,
  anyGradeId,
  cleanupSchool,
  newAccount,
  newSchool,
  newStudent,
} from '../test-helpers/fees.js';

/**
 * apply_fee_payment happy-path + overpayment (T063 / US3). After a partial payment:
 * account_balance = opening + payment, student_balance drops by payment, and the
 * targeted installment running balances reconcile (event-sum). Overpayment beyond
 * the total outstanding raises OVERPAYMENT_BLOCKED (running balance never negative).
 *
 * Balances are strings in the jsonb output — parse with Number().
 *
 * Integration test (Article X): requires 0005-0013 + apply_fee_payment + derived
 * balances applied. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

interface PaymentResult {
  money_event_id: string;
  receipt_no: number;
  account_balance_after: string;
  student_balance_after: string;
  allocations: { installment_id: string; running_balance_after: string }[];
  idempotent_replay: boolean;
}

d('apply_fee_payment (balances + overpayment)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;
  let accountId: string;
  let studentId: string;
  let installmentIds: string[];
  const OPENING = 1000;
  const CHARGE1 = 500;
  const CHARGE2 = 500;

  beforeAll(async () => {
    schoolId = await newSchool(service, 'afp');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
    accountId = await newAccount(service, schoolId, OPENING);
    studentId = await newStudent(service, schoolId, 'Payer');
    await anyGradeId(service); // ensure the reference seed exists
    installmentIds = await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: CHARGE1 },
      { sequence: 2, due_date: '2026-12-01', amount: CHARGE2 },
    ]);
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  async function pay(amount: number, allocations?: { installment_id: string; amount: number }[]) {
    return accountant.client.rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: amount,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: allocations ?? null,
      p_attachment_path: null,
    });
  }

  it('applies a partial payment: account up, student down, installment reconciles', async () => {
    const partial = 300;
    const { data, error } = await pay(partial, [
      { installment_id: installmentIds[0], amount: partial },
    ]);
    expect(error).toBeNull();
    const res = data as unknown as PaymentResult;

    expect(Number(res.account_balance_after)).toBe(OPENING + partial);
    // Student total charge = 1000; after a 300 payment student owes 700.
    expect(Number(res.student_balance_after)).toBe(CHARGE1 + CHARGE2 - partial);

    const alloc = res.allocations.find((a) => a.installment_id === installmentIds[0]);
    expect(alloc).toBeTruthy();
    // Installment 1 charge 500 − 300 paid = 200 running balance (never negative).
    expect(Number(alloc!.running_balance_after)).toBe(CHARGE1 - partial);
    expect(Number(alloc!.running_balance_after)).toBeGreaterThanOrEqual(0);
  });

  it('blocks overpayment beyond total outstanding (OVERPAYMENT_BLOCKED)', async () => {
    // Outstanding now = 700 (500 paid off inst1 leaves 200 + 500 inst2). Pay 10_000.
    const { error } = await pay(10_000);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('OVERPAYMENT_BLOCKED');

    // No running balance went negative — re-derive from the DB.
    for (const id of installmentIds) {
      const { data } = await service.rpc('installment_running_balance', { p_installment_id: id });
      expect(Number(data)).toBeGreaterThanOrEqual(0);
    }
  });
});
