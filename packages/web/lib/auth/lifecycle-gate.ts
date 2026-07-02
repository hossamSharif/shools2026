import { createSupabaseServerClient } from '../supabase/server.js';
import type { LifecycleState } from '@erp/ui';

export interface LifecycleInfo {
  state: LifecycleState;
  /** Days remaining until period_end (active/grace) or null if unknown. */
  daysRemaining: number | null;
}

/**
 * Server-side lifecycle lookup (T128, US8). Reads the DERIVED subscription
 * state via the `subscription_state` RPC (Article II/IV — the DB is the sole
 * write-gating authority; this is a read used only to drive UI affordances,
 * never to enforce — every mutate RPC re-checks server-side regardless).
 */
export async function getLifecycleInfo(schoolId: string | null): Promise<LifecycleInfo> {
  if (!schoolId) {
    return { state: 'active', daysRemaining: null };
  }

  const supabase = createSupabaseServerClient();

  const [{ data: state }, { data: sub }] = await Promise.all([
    supabase.rpc('subscription_state', { p_school_id: schoolId }),
    supabase
      .from('subscription')
      .select('period_end, grace_days')
      .eq('school_id', schoolId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lifecycleState = (state as LifecycleState) ?? 'locked';
  let daysRemaining: number | null = null;

  if (sub?.period_end) {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Khartoum' }));
    today.setHours(0, 0, 0, 0);
    const periodEnd = new Date(sub.period_end as string);
    const graceEnd = new Date(periodEnd);
    graceEnd.setDate(graceEnd.getDate() + ((sub.grace_days as number) ?? 0));

    const target = lifecycleState === 'active' ? periodEnd : graceEnd;
    daysRemaining = Math.max(
      0,
      Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  return { state: lifecycleState, daysRemaining };
}

/** True when the school may perform money/credit writes (state === 'active'). */
export function writesAllowed(state: LifecycleState): boolean {
  return state === 'active';
}
