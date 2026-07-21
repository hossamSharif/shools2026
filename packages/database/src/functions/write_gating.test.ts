import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';

/**
 * subscription_state derivation boundaries in Africa/Khartoum (T029). Verifies
 * active / grace / locked given period_end + grace_days relative to today.
 *
 * Integration test (Article X): requires a real Supabase instance with 0001 +
 * write_gating + 0002 (school/subscription) applied. Skips when env is unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('subscription_state (Africa/Khartoum boundaries)', () => {
  const supabase = getServiceClient()!;
  let schoolId: string;

  // Build an ISO date N days from "today in Khartoum". Formats directly in the
  // Khartoum timezone (en-CA locale yields YYYY-MM-DD) rather than round-tripping
  // through toISOString(), which converts back to UTC and rolls the date back
  // near midnight in a UTC+2 zone.
  const khartoumDateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Khartoum',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  function khartoumDatePlus(days: number): string {
    const shifted = new Date();
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return khartoumDateFormat.format(shifted);
  }

  beforeAll(async () => {
    const { data: school, error } = await supabase
      .from('school')
      .insert({ name: `t-substate-${Date.now()}` })
      .select('id')
      .single();
    if (error) throw error;
    schoolId = school!.id;
  });

  afterAll(async () => {
    if (schoolId) await supabase.from('school').delete().eq('id', schoolId);
  });

  async function setSubscription(periodEndOffsetDays: number, graceDays: number) {
    await supabase.from('subscription').delete().eq('school_id', schoolId);
    const { error } = await supabase.from('subscription').insert({
      school_id: schoolId,
      period_start: khartoumDatePlus(periodEndOffsetDays - 365),
      period_end: khartoumDatePlus(periodEndOffsetDays),
      grace_days: graceDays,
    });
    if (error) throw error;
  }

  async function state(): Promise<string> {
    const { data, error } = await supabase.rpc('subscription_state', { p_school_id: schoolId });
    if (error) throw error;
    return data as unknown as string;
  }

  it('is active when today <= period_end', async () => {
    await setSubscription(0, 14); // ends today
    expect(await state()).toBe('active');
    await setSubscription(5, 14);
    expect(await state()).toBe('active');
  });

  it('is grace within period_end + grace_days', async () => {
    await setSubscription(-1, 14); // expired yesterday, still in grace
    expect(await state()).toBe('grace');
    await setSubscription(-14, 14); // last grace day
    expect(await state()).toBe('grace');
  });

  it('is locked past period_end + grace_days', async () => {
    await setSubscription(-15, 14);
    expect(await state()).toBe('locked');
  });

  it('is locked (fail-safe) when no subscription row exists', async () => {
    await supabase.from('subscription').delete().eq('school_id', schoolId);
    expect(await state()).toBe('locked');
  });
});
