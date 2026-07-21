import { randomUUID } from 'node:crypto';
import { toZonedTime, format as formatTz } from 'date-fns-tz';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@erp/database/types';
import { countSmsSegments, type SmsProvider } from '@erp/shared';

const KHARTOUM_TZ = 'Africa/Khartoum';

export interface DispatchSchoolResult {
  school_id: string;
  outcome: 'completed' | 'stopped' | 'paused';
  matched: number;
  sent: number;
  skipped_no_phone: number;
  failed: number;
}

interface InstallmentCandidate {
  installment_id: string;
  student_id: string;
  student_name: string;
  grade_label: string;
  guardian_phone: string | null;
  due_date: string;
  outstanding: number;
}

/**
 * run-dispatch (T116) — finds installments matching active reminder rules for
 * one school (windows evaluated in Africa/Khartoum), builds the Arabic
 * reminder message, sends via the configured SmsProvider, atomically consumes
 * SMS credit, and logs every attempt. Stops cleanly the moment credit runs
 * out (never partial-charges, never double-sends — Article I/VI).
 */
export async function runDispatchForSchool(
  supabase: SupabaseClient<Database>,
  provider: SmsProvider,
  schoolId: string,
  now: Date = new Date(),
): Promise<DispatchSchoolResult> {
  const result: DispatchSchoolResult = {
    school_id: schoolId,
    outcome: 'completed',
    matched: 0,
    sent: 0,
    skipped_no_phone: 0,
    failed: 0,
  };

  const { data: subState, error: subErr } = await supabase.rpc('subscription_state', {
    p_school_id: schoolId,
  });
  if (subErr) throw subErr;
  if (subState !== 'active') {
    result.outcome = 'paused';
    return result;
  }

  const { data: rules, error: rulesErr } = await supabase
    .from('reminder_rule')
    .select('offset_kind, days, enabled')
    .eq('school_id', schoolId)
    .eq('enabled', true);
  if (rulesErr) throw rulesErr;
  if (!rules || rules.length === 0) return result;

  const today = toZonedTime(now, KHARTOUM_TZ);
  const todayStr = formatTz(today, 'yyyy-MM-dd', { timeZone: KHARTOUM_TZ });

  // Target due dates derived from each active rule's offset from "today".
  const targetDates = new Set<string>();
  for (const rule of rules) {
    const base = new Date(`${todayStr}T00:00:00Z`);
    const delta =
      rule.offset_kind === 'before' ? rule.days : rule.offset_kind === 'after' ? -rule.days : 0;
    base.setUTCDate(base.getUTCDate() + delta);
    targetDates.add(base.toISOString().slice(0, 10));
  }
  if (targetDates.size === 0) return result;

  const { data: installments, error: instErr } = await supabase
    .from('installment')
    .select('id, due_date, student_id, student:student_id(name, guardian_phone), amount_charged')
    .eq('school_id', schoolId)
    .in('due_date', Array.from(targetDates));
  if (instErr) throw instErr;

  const candidates: InstallmentCandidate[] = [];
  for (const row of installments ?? []) {
    const { data: outstanding } = await supabase.rpc('installment_running_balance', {
      p_installment_id: row.id,
    });
    if (!outstanding || Number(outstanding) <= 0) continue;
    const student = Array.isArray(row.student) ? row.student[0] : row.student;
    candidates.push({
      installment_id: row.id,
      student_id: row.student_id,
      student_name: student?.name ?? '',
      grade_label: '',
      guardian_phone: student?.guardian_phone ?? null,
      due_date: row.due_date,
      outstanding: Number(outstanding),
    });
  }

  result.matched = candidates.length;

  for (const c of candidates) {
    if (!c.guardian_phone) {
      result.skipped_no_phone += 1;
      continue;
    }

    const message = buildReminderMessage(c);
    const segments = countSmsSegments(message);
    const idempotencyKey = randomUUID();

    const { data: logRow, error: logErr } = await supabase
      .from('sms_message_log')
      .insert({
        school_id: schoolId,
        student_id: c.student_id,
        recipient_phone: c.guardian_phone,
        message_text: message,
        segments,
        status: 'queued',
        is_manual: false,
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single();
    if (logErr || !logRow) {
      result.failed += 1;
      continue;
    }

    const { error: consumeErr } = await supabase.rpc('consume_sms_credit', {
      p_school_id: schoolId,
      p_sms_message_id: logRow.id,
      p_segments: segments,
      p_idempotency_key: idempotencyKey,
    });

    if (consumeErr) {
      if (consumeErr.message?.includes('INSUFFICIENT_CREDIT')) {
        await supabase.from('sms_message_log').update({ status: 'failed' }).eq('id', logRow.id);
        result.outcome = 'stopped';
        break; // stop cleanly — no more sends this run
      }
      result.failed += 1;
      await supabase.from('sms_message_log').update({ status: 'failed' }).eq('id', logRow.id);
      continue;
    }

    try {
      const sendResult = await provider.send({
        to: c.guardian_phone,
        body: message,
        idempotencyKey,
      });
      await supabase
        .from('sms_message_log')
        .update({
          status: sendResult.status,
          provider_message_id: sendResult.providerMessageId,
        })
        .eq('id', logRow.id);
      result.sent += 1;
    } catch {
      // Transport failure after credit was already consumed: log as failed.
      // Credit is NOT refunded automatically (T110) — an operator can top up.
      await supabase.from('sms_message_log').update({ status: 'failed' }).eq('id', logRow.id);
      result.failed += 1;
    }
  }

  return result;
}

export function buildReminderMessage(c: InstallmentCandidate & { school_name?: string }): string {
  const amount = c.outstanding.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const date = c.due_date;
  return `تذكير: الطالب ${c.student_name} - ${c.grade_label}. قسط مستحق ${amount} ج.س بتاريخ ${date}. ${c.school_name ?? ''}`.trim();
}
