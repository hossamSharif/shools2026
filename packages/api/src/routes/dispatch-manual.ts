import { Router, type Router as RouterType } from 'express';
import { ManualReminderInput, type ManualReminderOutput, countSmsSegments } from '@erp/shared';
import { createSupabaseServiceClient } from '../supabase.js';
import { getSmsProvider } from '../providers/index.js';
import { requireInternalToken } from '../middleware/internal-auth.js';
import { buildReminderMessage } from '../dispatch/run-dispatch.js';

/**
 * POST /internal/dispatch/manual (T118) — a single manual reminder for one
 * student, triggered from the tenant UI's "send reminder" button. Same
 * credit/atomicity/logging rules as the batch dispatcher; gated by the same
 * internal token and write-gating (DISPATCH_PAUSED).
 */
export const dispatchManualRouter: RouterType = Router();

dispatchManualRouter.post('/internal/dispatch/manual', requireInternalToken, async (req, res) => {
  const parsed = ManualReminderInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parsed.error.flatten() });
  }
  const { school_id, student_id, installment_id, idempotency_key } = parsed.data;

  const supabase = createSupabaseServiceClient();

  const { data: subState, error: subErr } = await supabase.rpc('subscription_state', {
    p_school_id: school_id,
  });
  if (subErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });
  if (subState !== 'active') return res.status(409).json({ error: 'DISPATCH_PAUSED' });

  const { data: student, error: studentErr } = await supabase
    .from('student')
    .select('id, name, guardian_phone, school_id')
    .eq('id', student_id)
    .single();
  if (studentErr || !student || student.school_id !== school_id) {
    return res.status(404).json({ error: 'STUDENT_NOT_FOUND' });
  }
  if (!student.guardian_phone) {
    return res.status(422).json({ error: 'NO_GUARDIAN_PHONE' });
  }

  let dueDate = new Date().toISOString().slice(0, 10);
  let outstanding = 0;
  if (installment_id) {
    const { data: inst } = await supabase
      .from('installment')
      .select('due_date')
      .eq('id', installment_id)
      .single();
    if (inst) dueDate = inst.due_date;
    const { data: bal } = await supabase.rpc('installment_running_balance', {
      p_installment_id: installment_id,
    });
    outstanding = Number(bal ?? 0);
  } else {
    const { data: bal } = await supabase.rpc('student_balance', { p_student_id: student_id });
    outstanding = Number(bal ?? 0);
  }

  const message = buildReminderMessage({
    installment_id: installment_id ?? '',
    student_id,
    student_name: student.name,
    grade_label: '',
    guardian_phone: student.guardian_phone,
    due_date: dueDate,
    outstanding,
  });
  const segments = countSmsSegments(message);

  // Idempotent replay: a prior log row with the same idempotency_key exists.
  const { data: existing } = await supabase
    .from('sms_message_log')
    .select('id, status, segments')
    .eq('school_id', school_id)
    .eq('idempotency_key', idempotency_key)
    .maybeSingle();

  let smsMessageId = existing?.id;
  if (!smsMessageId) {
    const { data: logRow, error: logErr } = await supabase
      .from('sms_message_log')
      .insert({
        school_id,
        student_id,
        recipient_phone: student.guardian_phone,
        message_text: message,
        segments,
        status: 'queued',
        is_manual: true,
        idempotency_key,
      })
      .select('id')
      .single();
    if (logErr || !logRow) return res.status(500).json({ error: 'INTERNAL_ERROR' });
    smsMessageId = logRow.id;
  }

  const { data: consumeResult, error: consumeErr } = await supabase.rpc('consume_sms_credit', {
    p_school_id: school_id,
    p_sms_message_id: smsMessageId,
    p_segments: segments,
    p_idempotency_key: idempotency_key,
  });

  if (consumeErr) {
    if (consumeErr.message?.includes('INSUFFICIENT_CREDIT')) {
      return res.status(409).json({ error: 'INSUFFICIENT_CREDIT' });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  const provider = getSmsProvider();
  let status: 'queued' | 'sent' | 'delivered' | 'failed' = 'failed';
  try {
    const sendResult = await provider.send({
      to: student.guardian_phone,
      body: message,
      idempotencyKey: idempotency_key,
    });
    status = sendResult.status;
    await supabase
      .from('sms_message_log')
      .update({ status, provider_message_id: sendResult.providerMessageId })
      .eq('id', smsMessageId);
  } catch {
    await supabase.from('sms_message_log').update({ status: 'failed' }).eq('id', smsMessageId);
  }

  const balance = (consumeResult as { credit_balance_after?: number } | null)?.credit_balance_after ?? 0;
  const replay = (consumeResult as { idempotent_replay?: boolean } | null)?.idempotent_replay ?? false;

  const output: ManualReminderOutput = {
    sms_message_id: smsMessageId,
    status,
    segments,
    credit_balance_after: balance,
    idempotent_replay: replay,
  };
  return res.json(output);
});
