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
 * apply_fee_payment concurrency (T062 / US3, SC-003). N parallel payments in one
 * school must produce a GAPLESS 1..N receipt-number set — unique, no reuse — even
 * under contention (counter locked FOR UPDATE inside the function). A call that
 * throws before receipt assignment (OVERPAYMENT_BLOCKED) consumes no number.
 *
 * Integration test (Article X): requires 0005-0013 + apply_fee_payment applied.
 * Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

const N = 8;
const CHARGE = 100;

d('apply_fee_payment (concurrent receipt numbering)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;
  let accountId: string;
  // One student per parallel call, each with a single installment to pay in full.
  const students: { studentId: string; installmentId: string }[] = [];

  beforeAll(async () => {
    schoolId = await newSchool(service, 'afp-conc');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
    accountId = await newAccount(service, schoolId, 0);

    for (let i = 0; i < N; i++) {
      const studentId = await newStudent(service, schoolId, `Payer-${i}`);
      const [installmentId] = await addInstallments(service, schoolId, studentId, [
        { sequence: 1, due_date: '2026-09-01', amount: CHARGE },
      ]);
      students.push({ studentId, installmentId });
    }
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  function payFull(studentId: string) {
    return accountant.client.rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: CHARGE,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: null,
      p_attachment_path: null,
    });
  }

  it('assigns a gapless, unique 1..N receipt-number set under parallel load', async () => {
    const results = await Promise.all(students.map((s) => payFull(s.studentId)));

    for (const r of results) {
      expect(r.error).toBeNull();
    }
    const receiptNos = results
      .map((r) => (r.data as unknown as { receipt_no: number }).receipt_no)
      .sort((a, b) => a - b);

    // Unique.
    expect(new Set(receiptNos).size).toBe(N);
    // Gapless 1..N.
    expect(receiptNos).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    // Cross-check against the ledger: exactly N fee_payment rows with receipt_no.
    const { data: rows } = await service
      .from('money_event')
      .select('receipt_no')
      .eq('school_id', schoolId)
      .eq('event_type', 'fee_payment')
      .not('receipt_no', 'is', null);
    expect((rows ?? []).length).toBe(N);
  });

  it('a throwing call (OVERPAYMENT_BLOCKED) consumes no receipt number', async () => {
    // Counter is now at N+1. An overpayment on an already-paid student must fail
    // and NOT advance the counter (raised before/at receipt commit → rolled back).
    const before = await service
      .from('receipt_counter')
      .select('next_value')
      .eq('school_id', schoolId)
      .single();

    const { error } = await accountant.client.rpc('apply_fee_payment', {
      p_student_id: students[0].studentId, // already fully paid above
      p_account_id: accountId,
      p_amount: CHARGE,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
      p_allocations: null,
      p_attachment_path: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('OVERPAYMENT_BLOCKED');

    const after = await service
      .from('receipt_counter')
      .select('next_value')
      .eq('school_id', schoolId)
      .single();
    // The failed transaction rolled back the counter increment → no number burned.
    expect(after.data?.next_value).toBe(before.data?.next_value);

    // Still exactly N receipts on the ledger — no gap, no phantom.
    const { data: rows } = await service
      .from('money_event')
      .select('receipt_no')
      .eq('school_id', schoolId)
      .eq('event_type', 'fee_payment')
      .not('receipt_no', 'is', null);
    expect((rows ?? []).length).toBe(N);
  });
});
