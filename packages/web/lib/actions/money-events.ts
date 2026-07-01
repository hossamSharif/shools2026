'use server';

import { revalidatePath } from 'next/cache';
import {
  ApplyFeePaymentInput,
  ApplyFeePaymentOutput,
  RecordExpenseInput,
  RecordExpenseOutput,
  RecordTransferInput,
  RecordTransferOutput,
  RecordRefundInput,
  RecordRefundOutput,
  RecordAdjustmentInput,
  RecordAdjustmentOutput,
  ApplyDiscountInput,
  ApplyDiscountOutput,
  ReverseEventInput,
  ReverseEventOutput,
} from '@erp/shared/schemas';
import type { z } from 'zod';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requireRole } from '../auth/guard.js';

/**
 * Money-event RPC callers (US3/US4). Every mutation is a single Postgres
 * transaction (Article I); JS validates i/o with Zod (Article XI) and maps to
 * the `p_*` Postgres arg names. DB errors (WRITES_GATED, OVERPAYMENT_BLOCKED…)
 * surface as the exception message for the Arabic UI to render.
 */

async function callMoney<TOut>(
  fn: string,
  args: Record<string, unknown>,
  output: z.ZodType<TOut>,
): Promise<TOut> {
  await requireRole('school_admin', 'accountant');
  const supabase = createSupabaseServerClient();
  // `fn` is one of the money RPCs; the concrete name is chosen per-caller. Cast
  // to satisfy the rpc name-union overload (validated by the output schema).
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return output.parse(data);
}

export async function applyFeePayment(
  input: z.input<typeof ApplyFeePaymentInput>,
): Promise<ApplyFeePaymentOutput> {
  const v = ApplyFeePaymentInput.parse(input);
  const out = await callMoney(
    'apply_fee_payment',
    {
      p_student_id: v.student_id,
      p_account_id: v.account_id,
      p_amount: v.amount,
      p_occurred_at: v.occurred_at,
      p_idempotency_key: v.idempotency_key,
      p_allocations: v.allocations ?? null,
      p_attachment_path: v.attachment_path ?? null,
    },
    ApplyFeePaymentOutput,
  );
  revalidatePath('/payments');
  revalidatePath(`/students/${v.student_id}`);
  return out;
}

export async function recordExpense(
  input: z.input<typeof RecordExpenseInput>,
): Promise<RecordExpenseOutput> {
  const v = RecordExpenseInput.parse(input);
  const out = await callMoney(
    'record_expense',
    {
      p_account_id: v.account_id,
      p_amount: v.amount,
      p_category: v.category,
      p_occurred_at: v.occurred_at,
      p_idempotency_key: v.idempotency_key,
      p_vendor: v.vendor ?? null,
      p_description: v.description ?? null,
      p_attachment_path: v.attachment_path ?? null,
    },
    RecordExpenseOutput,
  );
  revalidatePath('/expenses');
  return out;
}

export async function recordTransfer(
  input: z.input<typeof RecordTransferInput>,
): Promise<RecordTransferOutput> {
  const v = RecordTransferInput.parse(input);
  const out = await callMoney(
    'record_transfer',
    {
      p_from_account_id: v.from_account_id,
      p_to_account_id: v.to_account_id,
      p_amount: v.amount,
      p_occurred_at: v.occurred_at,
      p_idempotency_key: v.idempotency_key,
      p_description: v.description ?? null,
    },
    RecordTransferOutput,
  );
  revalidatePath('/transfers');
  return out;
}

export async function recordRefund(
  input: z.input<typeof RecordRefundInput>,
): Promise<RecordRefundOutput> {
  const v = RecordRefundInput.parse(input);
  const out = await callMoney(
    'record_refund',
    {
      p_student_id: v.student_id,
      p_account_id: v.account_id,
      p_amount: v.amount,
      p_occurred_at: v.occurred_at,
      p_idempotency_key: v.idempotency_key,
      p_description: v.description ?? null,
      p_attachment_path: v.attachment_path ?? null,
    },
    RecordRefundOutput,
  );
  revalidatePath('/refunds');
  revalidatePath(`/students/${v.student_id}`);
  return out;
}

export async function recordAdjustment(
  input: z.input<typeof RecordAdjustmentInput>,
): Promise<RecordAdjustmentOutput> {
  const v = RecordAdjustmentInput.parse(input);
  const out = await callMoney(
    'record_adjustment',
    {
      p_student_id: v.student_id,
      p_amount: v.amount,
      p_reason: v.reason,
      p_occurred_at: v.occurred_at,
      p_idempotency_key: v.idempotency_key,
    },
    RecordAdjustmentOutput,
  );
  revalidatePath('/adjustments');
  revalidatePath(`/students/${v.student_id}`);
  return out;
}

export async function applyDiscount(
  input: z.input<typeof ApplyDiscountInput>,
): Promise<ApplyDiscountOutput> {
  const v = ApplyDiscountInput.parse(input);
  const out = await callMoney(
    'apply_discount',
    {
      p_student_id: v.student_id,
      p_kind: v.kind,
      p_value: v.value,
      p_idempotency_key: v.idempotency_key,
      p_installment_id: v.installment_id ?? null,
      p_reason: v.reason ?? null,
    },
    ApplyDiscountOutput,
  );
  revalidatePath(`/students/${v.student_id}`);
  return out;
}

export async function reverseEvent(
  input: z.input<typeof ReverseEventInput>,
): Promise<ReverseEventOutput> {
  const v = ReverseEventInput.parse(input);
  const out = await callMoney(
    'reverse_event',
    {
      p_money_event_id: v.money_event_id,
      p_reason: v.reason,
      p_idempotency_key: v.idempotency_key,
    },
    ReverseEventOutput,
  );
  revalidatePath('/');
  return out;
}
