import { z } from 'zod';
import { Money, Uuid } from '../schemas/primitives.js';

/**
 * The canonical, append-only typed money-event set (Article III). A single
 * `money_event` family discriminated by `event_type`. Discounts are tracked
 * separately (see schemas/money) and are NOT part of this discriminator.
 */
export const MONEY_EVENT_TYPES = [
  'fee_payment',
  'expense',
  'transfer',
  'refund',
  'adjustment',
] as const;

export const MoneyEventType = z.enum(MONEY_EVENT_TYPES);
export type MoneyEventType = z.infer<typeof MoneyEventType>;

/** Columns common to every posted money event. */
export const MoneyEventBase = z.object({
  id: Uuid,
  school_id: Uuid,
  event_type: MoneyEventType,
  amount: Money,
  actor_user_id: Uuid,
  occurred_at: z.string().datetime(),
  idempotency_key: Uuid,
  reverses_event_id: Uuid.nullable(),
  attachment_path: z.string().nullable(),
  notes: z.string().nullable(),
});
export type MoneyEventBase = z.infer<typeof MoneyEventBase>;

/** Event types that may carry a Storage attachment (see storage-contract). */
export const ATTACHMENT_EVENT_TYPES = ['fee_payment', 'expense', 'refund'] as const;
export type AttachmentEventType = (typeof ATTACHMENT_EVENT_TYPES)[number];

/**
 * Per-type field shapes (payload beyond the base row). These describe the
 * type-specific columns/derived data the RPCs read/write.
 */
export const FeePaymentFields = z.object({
  receipt_no: z.number().int().positive(),
});

export const ExpenseFields = z.object({
  category: z.string().min(1),
  vendor: z.string().nullable(),
  description: z.string().nullable(),
});

export const TransferFields = z.object({
  from_account_id: Uuid,
  to_account_id: Uuid,
});

export const RefundFields = z.object({
  student_id: Uuid,
});

export const AdjustmentFields = z.object({
  student_id: Uuid,
  reason: z.string().min(1),
});
