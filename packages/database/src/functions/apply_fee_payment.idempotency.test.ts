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
 * apply_fee_payment idempotency (T064 / US3). Replaying the same idempotency_key
 * returns the SAME money_event_id + receipt_no and does NOT create a second
 * money_event row (unique(school_id, idempotency_key) + replay branch).
 *
 * Integration test (Article X): requires 0005-0013 + apply_fee_payment applied.
 * Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('apply_fee_payment (idempotent replay)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let accountant: AuthedUser;
  let accountId: string;
  let studentId: string;

  beforeAll(async () => {
    schoolId = await newSchool(service, 'afp-idem');
    await activateSchool(service, schoolId);
    accountant = await createAuthedUser(service, 'accountant', schoolId);
    accountId = await newAccount(service, schoolId, 0);
    studentId = await newStudent(service, schoolId, 'Payer');
    await addInstallments(service, schoolId, studentId, [
      { sequence: 1, due_date: '2026-09-01', amount: 500 },
    ]);
  });

  afterAll(async () => {
    await accountant?.cleanup();
    await cleanupSchool(service, schoolId);
  });

  function pay(key: string, amount = 200) {
    return accountant.client.rpc('apply_fee_payment', {
      p_student_id: studentId,
      p_account_id: accountId,
      p_amount: amount,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: key,
      p_allocations: null,
      p_attachment_path: null,
    });
  }

  it('replaying the same key returns the same event/receipt and posts no second row', async () => {
    const key = crypto.randomUUID();

    const first = await pay(key);
    expect(first.error).toBeNull();
    const a = first.data as unknown as {
      money_event_id: string;
      receipt_no: number;
      idempotent_replay: boolean;
    };
    expect(a.idempotent_replay).toBe(false);

    const second = await pay(key);
    expect(second.error).toBeNull();
    const b = second.data as unknown as {
      money_event_id: string;
      receipt_no: number;
      idempotent_replay: boolean;
    };

    expect(b.money_event_id).toBe(a.money_event_id);
    expect(b.receipt_no).toBe(a.receipt_no);
    expect(b.idempotent_replay).toBe(true);

    // Exactly ONE money_event row for this key.
    const { data: rows } = await service
      .from('money_event')
      .select('id')
      .eq('school_id', schoolId)
      .eq('idempotency_key', key);
    expect((rows ?? []).length).toBe(1);
  });
});
