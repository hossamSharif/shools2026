import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@erp/database/types';

/**
 * Low-credit / insufficient-credit admin alert surfacing (T124, FR-041).
 * The derived SMS credit balance (Σtopups − Σconsumptions, Article II) is
 * read-only here — never written. A school is "low" below LOW_CREDIT_THRESHOLD
 * segments (roughly one day of reminders) and "insufficient" at zero.
 */
export const LOW_CREDIT_THRESHOLD = 50;

export type CreditAlertLevel = 'ok' | 'low' | 'insufficient';

export interface CreditAlertState {
  level: CreditAlertLevel;
  balance: number;
}

export async function getCreditAlertState(
  supabase: SupabaseClient<Database>,
  schoolId: string,
): Promise<CreditAlertState> {
  const [{ data: topups }, { data: consumptions }] = await Promise.all([
    supabase.from('sms_credit_topup').select('amount').eq('school_id', schoolId),
    supabase.from('sms_credit_consumption').select('segments').eq('school_id', schoolId),
  ]);

  const totalTopups = (topups ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const totalConsumed = (consumptions ?? []).reduce((sum, r) => sum + (r.segments ?? 0), 0);
  const balance = totalTopups - totalConsumed;

  const level: CreditAlertLevel =
    balance <= 0 ? 'insufficient' : balance < LOW_CREDIT_THRESHOLD ? 'low' : 'ok';

  return { level, balance };
}

export const CREDIT_ALERT_LABEL: Record<CreditAlertLevel, string> = {
  ok: '',
  low: 'رصيد الرسائل النصية منخفض — يُرجى الشحن قريبًا',
  insufficient: 'رصيد الرسائل النصية غير كافٍ — توقف إرسال التذكيرات',
};
