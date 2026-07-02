import { z } from 'zod';
import { Uuid, IdempotencyKey } from './primitives.js';
import { SmsStatus } from '../sms/provider.js';

/**
 * Worker RPC/HTTP i/o schemas (US7 — reminder dispatch + delivery webhook).
 * These mirror contracts/worker-endpoints.md; the worker validates request
 * bodies with these before calling the DB functions.
 */

// ── reminder_rule (config) ───────────────────────────────────────────────────
export const ReminderRuleOffsetKind = z.enum(['before', 'on', 'after']);
export type ReminderRuleOffsetKind = z.infer<typeof ReminderRuleOffsetKind>;

export const ReminderRule = z.object({
  id: Uuid,
  school_id: Uuid,
  offset_kind: ReminderRuleOffsetKind,
  days: z.number().int().min(0),
  enabled: z.boolean(),
});
export type ReminderRule = z.infer<typeof ReminderRule>;

// ── POST /internal/dispatch/run ──────────────────────────────────────────────
export const DispatchRunInput = z.object({
  school_id: Uuid.optional(), // omitted ⇒ all active schools
});
export type DispatchRunInput = z.infer<typeof DispatchRunInput>;

export const DispatchRunSchoolResult = z.object({
  school_id: Uuid,
  outcome: z.enum(['completed', 'stopped', 'paused']),
  matched: z.number().int().min(0),
  sent: z.number().int().min(0),
  skipped_no_phone: z.number().int().min(0),
  failed: z.number().int().min(0),
});
export type DispatchRunSchoolResult = z.infer<typeof DispatchRunSchoolResult>;

export const DispatchRunOutput = z.object({
  results: z.array(DispatchRunSchoolResult),
});
export type DispatchRunOutput = z.infer<typeof DispatchRunOutput>;

// ── POST /internal/dispatch/manual ───────────────────────────────────────────
export const ManualReminderInput = z.object({
  school_id: Uuid,
  student_id: Uuid,
  installment_id: Uuid.optional(),
  idempotency_key: IdempotencyKey,
});
export type ManualReminderInput = z.infer<typeof ManualReminderInput>;

export const ManualReminderOutput = z.object({
  sms_message_id: Uuid,
  status: SmsStatus,
  segments: z.number().int().positive(),
  credit_balance_after: z.number().int(),
  idempotent_replay: z.boolean().optional(),
});
export type ManualReminderOutput = z.infer<typeof ManualReminderOutput>;

// ── POST /webhooks/sms/delivery ──────────────────────────────────────────────
export const DeliveryWebhookInput = z.object({
  provider_message_id: z.string().min(1),
  status: z.string().min(1), // provider-native status string; normalized server-side
});
export type DeliveryWebhookInput = z.infer<typeof DeliveryWebhookInput>;

export const DeliveryWebhookOutput = z.object({
  ok: z.literal(true),
  status: SmsStatus.optional(),
});
export type DeliveryWebhookOutput = z.infer<typeof DeliveryWebhookOutput>;

// ── sms_message_log (read model for UI) ──────────────────────────────────────
export const SmsMessageLogRow = z.object({
  id: Uuid,
  school_id: Uuid,
  student_id: Uuid,
  recipient_phone: z.string(),
  message_text: z.string(),
  segments: z.number().int().positive(),
  status: SmsStatus,
  provider_message_id: z.string().nullable(),
  is_manual: z.boolean(),
  created_at: z.string(),
});
export type SmsMessageLogRow = z.infer<typeof SmsMessageLogRow>;
