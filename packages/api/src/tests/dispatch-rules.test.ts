import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@erp/database/types';
import { runDispatchForSchool } from '../dispatch/run-dispatch.js';
import { createFakeSupabase } from './test-helpers/fake-supabase.js';

/**
 * T109: dispatch must skip students with no valid guardian phone (and count
 * them), and a paused school (grace/locked subscription state) must send
 * nothing at all.
 */
describe('dispatch rules', () => {
  const schoolId = 'school-1';

  it('skips and counts students with no guardian phone', async () => {
    const state = {
      reminder_rule: [{ offset_kind: 'on', days: 0, enabled: true, school_id: schoolId }],
      installment: [
        {
          id: 'inst-1',
          due_date: '2026-07-03',
          student_id: 'student-1',
          student: { name: 'أحمد', guardian_phone: null },
          amount_charged: 1000,
          school_id: schoolId,
        },
        {
          id: 'inst-2',
          due_date: '2026-07-03',
          student_id: 'student-2',
          student: { name: 'سارة', guardian_phone: '+249900000001' },
          amount_charged: 1000,
          school_id: schoolId,
        },
      ],
      sms_message_log: [] as Array<Record<string, unknown>>,
    };

    const fake = createFakeSupabase(state, {
      subscription_state: () => ({ data: 'active', error: null }),
      installment_running_balance: () => ({ data: 500, error: null }),
      consume_sms_credit: () => ({
        data: { credit_balance_after: 100, idempotent_replay: false },
        error: null,
      }),
    });

    const provider = {
      send: vi.fn().mockResolvedValue({ providerMessageId: 'p1', status: 'sent' }),
      normalizeWebhook: vi.fn(),
    };

    const result = await runDispatchForSchool(
      fake as unknown as SupabaseClient<Database>,
      provider,
      schoolId,
      new Date('2026-07-03T06:00:00Z'),
    );

    expect(result.matched).toBe(2);
    expect(result.skipped_no_phone).toBe(1);
    expect(result.sent).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the school is paused (grace/locked)', async () => {
    const state = {
      reminder_rule: [{ offset_kind: 'on', days: 0, enabled: true, school_id: schoolId }],
      installment: [
        {
          id: 'inst-1',
          due_date: '2026-07-03',
          student_id: 'student-1',
          student: { name: 'أحمد', guardian_phone: '+249900000001' },
          amount_charged: 1000,
          school_id: schoolId,
        },
      ],
      sms_message_log: [] as Array<Record<string, unknown>>,
    };

    const fake = createFakeSupabase(state, {
      subscription_state: () => ({ data: 'locked', error: null }),
    });

    const provider = { send: vi.fn(), normalizeWebhook: vi.fn() };

    const result = await runDispatchForSchool(
      fake as unknown as SupabaseClient<Database>,
      provider,
      schoolId,
      new Date('2026-07-03T06:00:00Z'),
    );

    expect(result.outcome).toBe('paused');
    expect(result.sent).toBe(0);
    expect(result.matched).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('also skips nothing when in grace period is treated the same as locked (not active)', async () => {
    const fake = createFakeSupabase(
      { reminder_rule: [], installment: [], sms_message_log: [] },
      { subscription_state: () => ({ data: 'grace', error: null }) },
    );
    const provider = { send: vi.fn(), normalizeWebhook: vi.fn() };

    const result = await runDispatchForSchool(
      fake as unknown as SupabaseClient<Database>,
      provider,
      schoolId,
      new Date('2026-07-03T06:00:00Z'),
    );

    expect(result.outcome).toBe('paused');
    expect(provider.send).not.toHaveBeenCalled();
  });
});
