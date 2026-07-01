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
  cleanupSchool,
  newAccount,
  newSchool,
  newStudent,
} from '../test-helpers/fees.js';

/**
 * US4 money events (T076): expense / transfer / refund / adjustment / discount.
 *  - record_expense reduces the account balance.
 *  - record_transfer moves amount from→to (from down, to up, sum neutral).
 *  - record_refund reduces the account AND raises what the student owes.
 *  - record_adjustment (write-off) reduces what the student owes.
 *  - apply_discount (percentage/fixed) reduces student balance with NO cash move.
 *
 * Balances are strings in jsonb output — parse with Number().
 *
 * Integration test (Article X): requires 0005-0016 + record_* / apply_discount +
 * derived_balances_v2 applied. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('US4 money events', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;

  beforeAll(async () => {
    schoolId = await newSchool(service, 'money');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  const rpc = (fn: string, args: Record<string, unknown>) => accountant.client.rpc(fn, args);

  it('record_expense reduces the account balance', async () => {
    const accountId = await newAccount(service, schoolId, 1000);
    const { data, error } = await rpc('record_expense', {
      p_account_id: accountId,
      p_amount: 250,
      p_category: 'salaries',
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_vendor: null,
      p_description: null,
      p_attachment_path: null,
    });
    expect(error).toBeNull();
    expect(Number((data as { account_balance_after: string }).account_balance_after)).toBe(750);
  });

  it('record_transfer moves amount from→to and is sum-neutral', async () => {
    const from = await newAccount(service, schoolId, 1000);
    const to = await newAccount(service, schoolId, 200);
    const { data, error } = await rpc('record_transfer', {
      p_from_account_id: from,
      p_to_account_id: to,
      p_amount: 300,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_description: null,
    });
    expect(error).toBeNull();
    const res = data as { from_balance_after: string; to_balance_after: string };
    expect(Number(res.from_balance_after)).toBe(700);
    expect(Number(res.to_balance_after)).toBe(500);
    // Sum neutral: 700 + 500 == 1000 + 200.
    expect(Number(res.from_balance_after) + Number(res.to_balance_after)).toBe(1200);
  });

  it('record_refund reduces the account and raises what the student owes', async () => {
    const accountId = await newAccount(service, schoolId, 1000);
    const studentId = await newStudent(service, schoolId, 'Refundee');
    // Charge 500, pay it, so the student owes 0 before the refund.
    const [instId] = await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 500 },
    ]);
    await rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: 500,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: [{ installment_id: instId, amount: 500 }],
      p_attachment_path: null,
    });

    const { data: sBefore } = await service.rpc('student_balance', { p_student_id: studentId });
    const { data, error } = await rpc('record_refund', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: 120,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_description: null,
      p_attachment_path: null,
    });
    expect(error).toBeNull();
    const res = data as { account_balance_after: string; student_balance_after: string };
    // Account had 1000 opening + 500 payment − 120 refund = 1380.
    expect(Number(res.account_balance_after)).toBe(1000 + 500 - 120);
    // A refund increases what the student owes by the refunded amount.
    expect(Number(res.student_balance_after)).toBe(Number(sBefore) + 120);
  });

  it('record_adjustment (write-off) reduces what the student owes', async () => {
    const studentId = await newStudent(service, schoolId, 'WriteOff');
    await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 500 },
    ]);
    const { data: sBefore } = await service.rpc('student_balance', { p_student_id: studentId });
    const { data, error } = await rpc('record_adjustment', {
      p_student_id: studentId,
      p_amount: 200,
      p_reason: 'hardship write-off',
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    expect(Number((data as { student_balance_after: string }).student_balance_after)).toBe(
      Number(sBefore) - 200,
    );
  });

  it('apply_discount percentage reduces student balance with no cash movement', async () => {
    const accountId = await newAccount(service, schoolId, 1000);
    const { data: accBefore } = await service.rpc('account_balance', { p_account_id: accountId });

    const studentId = await newStudent(service, schoolId, 'DiscountPct');
    const [instId] = await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 1000 },
    ]);
    const { data: sBefore } = await service.rpc('student_balance', { p_student_id: studentId });

    const { data, error } = await rpc('apply_discount', {
      p_student_id: studentId,
      p_kind: 'percentage',
      p_value: 10, // 10% of the 1000 installment = 100
      p_idempotency_key: crypto.randomUUID(),
      p_installment_id: instId,
      p_reason: null,
    });
    expect(error).toBeNull();
    const res = data as { computed_amount: string; student_balance_after: string };
    expect(Number(res.computed_amount)).toBe(100);
    expect(Number(res.student_balance_after)).toBe(Number(sBefore) - 100);

    // No cash movement: the (unrelated) account balance is unchanged.
    const { data: accAfter } = await service.rpc('account_balance', { p_account_id: accountId });
    expect(Number(accAfter)).toBe(Number(accBefore));
  });

  it('apply_discount fixed reduces student balance by the fixed value', async () => {
    const studentId = await newStudent(service, schoolId, 'DiscountFixed');
    await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 1000 },
    ]);
    const { data: sBefore } = await service.rpc('student_balance', { p_student_id: studentId });
    const { data, error } = await rpc('apply_discount', {
      p_student_id: studentId,
      p_kind: 'fixed',
      p_value: 150,
      p_idempotency_key: crypto.randomUUID(),
      p_installment_id: null,
      p_reason: 'sibling',
    });
    expect(error).toBeNull();
    const res = data as { computed_amount: string; student_balance_after: string };
    expect(Number(res.computed_amount)).toBe(150);
    expect(Number(res.student_balance_after)).toBe(Number(sBefore) - 150);
  });
});
