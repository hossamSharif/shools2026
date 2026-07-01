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
 * reverse_event (T077 / US4, SC-005). Reversing a fee_payment:
 *  - leaves BOTH the original and the reversal rows visible (no UPDATE/DELETE),
 *  - the reversal has reverses_event_id set to the original,
 *  - the account balance returns to its pre-payment value.
 * Reversing an already-reversed event raises ALREADY_REVERSED.
 *
 * Integration test (Article X): requires 0005-0016 + apply_fee_payment +
 * reverse_event + derived_balances_v2 applied. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('reverse_event (append-only reversal)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;
  let accountId: string;
  let studentId: string;
  let instId: string;
  const OPENING = 1000;
  const PAYMENT = 300;

  beforeAll(async () => {
    schoolId = await newSchool(service, 'rev');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
    accountId = await newAccount(service, schoolId, OPENING);
    studentId = await newStudent(service, schoolId, 'Payer');
    [instId] = await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 500 },
    ]);
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  it('keeps both rows, links the reversal, and restores the account balance', async () => {
    // Pre-payment account balance.
    const { data: preBal } = await service.rpc('account_balance', { p_account_id: accountId });
    expect(Number(preBal)).toBe(OPENING);

    // Post a fee payment (account goes up).
    const { data: payData, error: payErr } = await accountant.client.rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: PAYMENT,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: [{ installment_id: instId, amount: PAYMENT }],
      p_attachment_path: null,
    });
    expect(payErr).toBeNull();
    const originalId = (payData as unknown as { money_event_id: string }).money_event_id;

    const { data: midBal } = await service.rpc('account_balance', { p_account_id: accountId });
    expect(Number(midBal)).toBe(OPENING + PAYMENT);

    // Reverse it.
    const { data: revData, error: revErr } = await accountant.client.rpc('reverse_event', {
      p_money_event_id: originalId,
      p_reason: 'entered in error',
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(revErr).toBeNull();
    const reversalId = (revData as { reversing_event_id: string }).reversing_event_id;
    expect((revData as { reverses_event_id: string }).reverses_event_id).toBe(originalId);

    // Both rows remain visible (no UPDATE/DELETE of posted rows).
    const { data: rows } = await service
      .from('money_event')
      .select('id, reverses_event_id')
      .in('id', [originalId, reversalId]);
    expect((rows ?? []).length).toBe(2);
    const reversal = rows!.find((r) => r.id === reversalId);
    expect(reversal!.reverses_event_id).toBe(originalId);
    const original = rows!.find((r) => r.id === originalId);
    expect(original!.reverses_event_id).toBeNull();

    // Account balance returns to pre-payment value.
    const { data: postBal } = await service.rpc('account_balance', { p_account_id: accountId });
    expect(Number(postBal)).toBe(OPENING);
  });

  it('refuses to reverse an already-reversed event (ALREADY_REVERSED)', async () => {
    // Post a fresh payment, reverse it once (ok), then try to reverse it again.
    const { data: payData } = await accountant.client.rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: 100,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: [{ installment_id: instId, amount: 100 }],
      p_attachment_path: null,
    });
    const originalId = (payData as unknown as { money_event_id: string }).money_event_id;

    const firstReverse = await accountant.client.rpc('reverse_event', {
      p_money_event_id: originalId,
      p_reason: 'first reversal',
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(firstReverse.error).toBeNull();

    const secondReverse = await accountant.client.rpc('reverse_event', {
      p_money_event_id: originalId,
      p_reason: 'second reversal attempt',
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(secondReverse.error).not.toBeNull();
    expect(secondReverse.error?.message).toContain('ALREADY_REVERSED');
  });
});
