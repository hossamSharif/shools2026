'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CreateSchoolInput,
  SetSubscriptionInput,
  TopupSmsCreditInput,
  TopupSmsCreditOutput,
} from '@erp/shared/schemas';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requireRole } from '../auth/guard.js';
import { callRpc } from '../rpc/call.js';

// RPC arg shape for topup_sms_credit (Postgres param names).
const TopupRpcArgs = z.object({
  p_school_id: z.string().uuid(),
  p_amount: z.number().int().positive(),
  p_idempotency_key: z.string().uuid(),
});

/**
 * Light CRUD for the super-admin onboarding surface (US1). Money math stays in
 * Postgres; these only touch the school/subscription spine (Article VI). RLS
 * enforces super-admin; requireRole is defense-in-depth.
 */

export interface CreateSchoolResult {
  schoolId: string;
}

/** Create a school and set its initial subscription window in one action. */
export async function createSchoolWithSubscription(input: {
  name: string;
  period_start: string;
  period_end: string;
  grace_days?: number;
}): Promise<CreateSchoolResult> {
  await requireRole('super_admin');
  const supabase = createSupabaseServerClient();

  const { name } = CreateSchoolInput.parse({ name: input.name });

  const { data: school, error: schoolErr } = await supabase
    .from('school')
    .insert({ name })
    .select('id')
    .single<{ id: string }>();
  if (schoolErr || !school) throw new Error(schoolErr?.message ?? 'failed to create school');

  const sub = SetSubscriptionInput.parse({
    school_id: school.id,
    period_start: input.period_start,
    period_end: input.period_end,
    grace_days: input.grace_days ?? 14,
  });

  const { error: subErr } = await supabase.from('subscription').insert({
    school_id: sub.school_id,
    period_start: sub.period_start,
    period_end: sub.period_end,
    grace_days: sub.grace_days,
  });
  if (subErr) throw new Error(subErr.message);

  revalidatePath('/schools');
  return { schoolId: school.id };
}

/** Update an existing subscription window. */
export async function updateSubscription(input: {
  school_id: string;
  period_start: string;
  period_end: string;
  grace_days?: number;
}): Promise<void> {
  await requireRole('super_admin');
  const supabase = createSupabaseServerClient();
  const sub = SetSubscriptionInput.parse({ ...input, grace_days: input.grace_days ?? 14 });

  const { error } = await supabase
    .from('subscription')
    .update({
      period_start: sub.period_start,
      period_end: sub.period_end,
      grace_days: sub.grace_days,
    })
    .eq('school_id', sub.school_id);
  if (error) throw new Error(error.message);

  revalidatePath('/schools');
}

/** Add SMS credit via the topup_sms_credit RPC (money function). */
export async function topupSmsCredit(input: {
  school_id: string;
  amount: number;
  idempotency_key: string;
}): Promise<TopupSmsCreditOutput> {
  await requireRole('super_admin');
  const supabase = createSupabaseServerClient();

  // Validate the semantic input, then map to the RPC's Postgres arg names.
  const semantic = TopupSmsCreditInput.parse(input);
  const result = await callRpc(
    supabase,
    'topup_sms_credit',
    {
      p_school_id: semantic.school_id,
      p_amount: semantic.amount,
      p_idempotency_key: semantic.idempotency_key,
    },
    TopupRpcArgs,
    TopupSmsCreditOutput,
  );

  revalidatePath(`/schools/${input.school_id}/credit`);
  return result;
}
