import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getServiceClient,
  INTEGRATION_ENV_READY,
  setSubscriptionState,
} from '../test-helpers/supabase.js';
import { buildAccessFixture, type AccessFixture } from './fixture.js';

/**
 * Finance stays hidden from a teacher in every subscription state (SC-004,
 * tasks T025). Write gating must never be what hides finance: the permission
 * does, so active, grace and locked all return 0 rows.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('teacher sees no finance in any subscription state', () => {
  const service = getServiceClient()!;
  let fx: AccessFixture;

  beforeAll(async () => {
    fx = await buildAccessFixture(service);
  }, 180_000);

  afterAll(async () => {
    await fx?.cleanup();
  }, 180_000);

  it.each(['active', 'grace', 'locked'] as const)('%s', async (state) => {
    await setSubscriptionState(service, fx.schoolA, state);
    const { data: s } = await service.rpc('subscription_state', { p_school_id: fx.schoolA });
    expect(s).toBe(state);
    for (const table of ['money_event', 'installment', 'receipt_counter'] as const) {
      const { data } = await fx.users.teacher.client.from(table).select('school_id');
      expect(data ?? [], `${state}: ${table}`).toHaveLength(0);
    }
  });
});
