'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requireRole } from '../auth/guard.js';

/**
 * Reminder-rule config + manual-reminder trigger (US7). Rule CRUD is plain
 * tenant-scoped RLS writes (not money); the manual send calls the worker's
 * `/internal/dispatch/manual` endpoint — money/credit consumption always
 * happens in the worker's single-transaction DB function, never in JS.
 */

async function schoolCtx() {
  const ctx = await requireRole('school_admin', 'accountant');
  const supabase = createSupabaseServerClient();
  if (!ctx.schoolId) throw new Error('no school context');
  return { ctx, supabase, schoolId: ctx.schoolId };
}

export async function setReminderRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  const { error } = await supabase
    .from('reminder_rule')
    .update({ enabled })
    .eq('id', ruleId)
    .eq('school_id', schoolId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/reminders');
}

export async function updateReminderRuleDays(ruleId: string, days: number): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  if (!Number.isInteger(days) || days < 0) throw new Error('عدد الأيام غير صالح');
  const { error } = await supabase
    .from('reminder_rule')
    .update({ days })
    .eq('id', ruleId)
    .eq('school_id', schoolId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/reminders');
}

export interface ManualReminderResult {
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  segments: number;
  credit_balance_after: number;
}

export async function sendManualReminder(
  studentId: string,
  installmentId?: string,
): Promise<ManualReminderResult> {
  const { schoolId } = await schoolCtx();

  const base = process.env.WORKER_URL;
  const token = process.env.INTERNAL_DISPATCH_TOKEN;
  if (!base || !token) throw new Error('WORKER_URL / INTERNAL_DISPATCH_TOKEN غير مضبوطة');

  const res = await fetch(`${base}/internal/dispatch/manual`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      school_id: schoolId,
      student_id: studentId,
      installment_id: installmentId,
      idempotency_key: randomUUID(),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'INTERNAL_ERROR' }));
    if (body.error === 'INSUFFICIENT_CREDIT') {
      throw new Error('رصيد الرسائل غير كافٍ لإرسال هذا التذكير');
    }
    if (body.error === 'DISPATCH_PAUSED') {
      throw new Error('الإرسال متوقف — يرجى تجديد الاشتراك');
    }
    if (body.error === 'SMS_DISPATCH_DISABLED') {
      throw new Error('خدمة الرسائل غير مفعّلة في هذا النظام');
    }
    throw new Error('تعذّر إرسال التذكير');
  }

  const data = await res.json();
  revalidatePath(`/students/${studentId}/sms`);
  revalidatePath('/sms');
  return data as ManualReminderResult;
}
