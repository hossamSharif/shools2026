import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@erp/database/types';
import { runDispatchForSchool } from '../dispatch/run-dispatch.js';
import { createFakeSupabase } from './test-helpers/fake-supabase.js';

/**
 * T108 (G6/SC-011): a dispatch batch that runs out of credit mid-run must
 * never push consume_sms_credit's derived balance negative, never double
 * charge the same message, and must stop cleanly — reporting accurate
 * sent-vs-skipped counts instead of silently failing partway.
 */
describe('dispatch credit integrity', () => {
  const schoolId = 'school-1';

  function makeInstallments(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `inst-${i}`,
      due_date: '2026-07-03',
      student_id: `student-${i}`,
      student: { name: `طالب ${i}`, guardian_phone: '+249900000000' },
      amount_charged: 1000,
      school_id: schoolId,
    }));
  }

  it('stops cleanly once credit is insufficient — never negative, never double-charged', async () => {
    let balance = 2; // only 2 segments of credit available
    const consumed = new Set<string>();

    const state = {
      reminder_rule: [{ offset_kind: 'on', days: 0, enabled: true, school_id: schoolId }],
      installment: makeInstallments(5),
      sms_message_log: [] as Array<Record<string, unknown>>,
    };

    const fake = createFakeSupabase(state, {
      subscription_state: () => ({ data: 'active', error: null }),
      installment_running_balance: () => ({ data: 500, error: null }),
      consume_sms_credit: (args) => {
        const key = args.p_sms_message_id as string;
        if (consumed.has(key)) {
          return { data: { credit_balance_after: balance, idempotent_replay: true }, error: null };
        }
        const segments = args.p_segments as number;
        if (balance - segments < 0) {
          return { data: null, error: { message: 'INSUFFICIENT_CREDIT' } };
        }
        balance -= segments;
        consumed.add(key);
        return { data: { credit_balance_after: balance, idempotent_replay: false }, error: null };
      },
    });

    const provider = { send: vi.fn().mockResolvedValue({ providerMessageId: 'p1', status: 'sent' }), normalizeWebhook: vi.fn() };

    const result = await runDispatchForSchool(
      fake as unknown as SupabaseClient<Database>,
      provider,
      schoolId,
      new Date('2026-07-03T06:00:00Z'),
    );

    expect(balance).toBeGreaterThanOrEqual(0);
    expect(result.outcome).toBe('stopped');
    expect(result.sent).toBe(2); // exactly as much credit allowed
    expect(consumed.size).toBe(2);
  });

  it('never charges the same message twice on idempotent replay', async () => {
    let balance = 10;
    const consumed = new Set<string>();
    const chargeCount = new Map<string, number>();

    const state = {
      reminder_rule: [{ offset_kind: 'on', days: 0, enabled: true, school_id: schoolId }],
      installment: makeInstallments(1),
      sms_message_log: [] as Array<Record<string, unknown>>,
    };

    const fake = createFakeSupabase(state, {
      subscription_state: () => ({ data: 'active', error: null }),
      installment_running_balance: () => ({ data: 500, error: null }),
      consume_sms_credit: (args) => {
        const key = args.p_sms_message_id as string;
        chargeCount.set(key, (chargeCount.get(key) ?? 0) + 1);
        if (consumed.has(key)) {
          return { data: { credit_balance_after: balance, idempotent_replay: true }, error: null };
        }
        balance -= args.p_segments as number;
        consumed.add(key);
        return { data: { credit_balance_after: balance, idempotent_replay: false }, error: null };
      },
    });

    const provider = { send: vi.fn().mockResolvedValue({ providerMessageId: 'p1', status: 'sent' }), normalizeWebhook: vi.fn() };

    await runDispatchForSchool(fake as unknown as SupabaseClient<Database>, provider, schoolId, new Date('2026-07-03T06:00:00Z'));

    for (const count of chargeCount.values()) {
      expect(count).toBe(1); // one attempt per message in a single run
    }
  });
});
