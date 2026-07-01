import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getServiceClient,
  createAuthedUser,
  INTEGRATION_ENV_READY,
  type AuthedUser,
} from '../test-helpers/supabase.js';

/**
 * topup_sms_credit (T032): adds credit, logs actor/when, balance = Σtopups;
 * super-admin only; idempotent. Integration test (Article X) — requires 0001-0004
 * + topup_sms_credit applied. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('topup_sms_credit', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let superAdmin: AuthedUser;
  let schoolAdmin: AuthedUser;

  beforeAll(async () => {
    const { data: school, error } = await service
      .from('school')
      .insert({ name: `t-topup-${Date.now()}` })
      .select('id')
      .single();
    if (error) throw error;
    schoolId = school!.id;

    superAdmin = await createAuthedUser(service, 'super_admin', null);
    schoolAdmin = await createAuthedUser(service, 'school_admin', schoolId);
  });

  afterAll(async () => {
    await service.from('sms_credit_topup').delete().eq('school_id', schoolId);
    await superAdmin?.cleanup();
    await schoolAdmin?.cleanup();
    if (schoolId) await service.from('school').delete().eq('id', schoolId);
  });

  async function topup(client: SupabaseClient, amount: number, key: string) {
    return client.rpc('topup_sms_credit', {
      p_school_id: schoolId,
      p_amount: amount,
      p_idempotency_key: key,
    });
  }

  it('adds credit and returns the derived balance (= Σtopups)', async () => {
    const { data, error } = await topup(superAdmin.client, 1000, crypto.randomUUID());
    expect(error).toBeNull();
    expect((data as { credit_balance_after: number }).credit_balance_after).toBe(1000);

    const { data: data2 } = await topup(superAdmin.client, 500, crypto.randomUUID());
    expect((data2 as { credit_balance_after: number }).credit_balance_after).toBe(1500);
  });

  it('logs the actor and timestamp on each topup', async () => {
    const { data: rows } = await service
      .from('sms_credit_topup')
      .select('actor_user_id, created_at, amount')
      .eq('school_id', schoolId);
    expect((rows ?? []).length).toBeGreaterThanOrEqual(2);
    for (const r of rows ?? []) {
      expect(r.actor_user_id).toBe(superAdmin.userId);
      expect(r.created_at).toBeTruthy();
    }
  });

  it('is idempotent — replaying a key does not double-post', async () => {
    const key = crypto.randomUUID();
    const { data: first } = await topup(superAdmin.client, 200, key);
    const { data: second } = await topup(superAdmin.client, 200, key);
    expect((first as { credit_balance_after: number }).credit_balance_after).toBe(
      (second as { credit_balance_after: number }).credit_balance_after,
    );
  });

  it('rejects a non-super-admin caller (FORBIDDEN)', async () => {
    const { error } = await topup(schoolAdmin.client, 100, crypto.randomUUID());
    expect(error).not.toBeNull();
    expect(error?.message).toContain('FORBIDDEN');
  });
});
