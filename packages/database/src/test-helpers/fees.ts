import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared arrange helpers for the US2-US4 money integration tests. All inserts use
 * the service-role client (bypasses RLS) to build tenant data; the RPCs under test
 * are then invoked on an accountant-authed client so RLS + auth.uid() apply.
 */

/** Make a school write-enabled (active): future period_end, 14-day grace. */
export async function activateSchool(service: SupabaseClient, schoolId: string): Promise<void> {
  await service.from('subscription').delete().eq('school_id', schoolId);
  const today = new Date();
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);
  const { error } = await service.from('subscription').insert({
    school_id: schoolId,
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    grace_days: 14,
  });
  if (error) throw error;
}

export async function newSchool(service: SupabaseClient, tag: string): Promise<string> {
  const { data, error } = await service
    .from('school')
    .insert({ name: `t-${tag}-${Date.now()}-${Math.round(Math.random() * 1e6)}` })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id;
}

export async function anyGradeId(service: SupabaseClient): Promise<string> {
  const { data, error } = await service.from('grade').select('id').limit(1).single();
  if (error) throw error;
  return data!.id;
}

export async function newAccount(
  service: SupabaseClient,
  schoolId: string,
  opening = 0,
  type: 'cash' | 'bank' = 'cash',
): Promise<string> {
  const { data, error } = await service
    .from('account')
    .insert({ school_id: schoolId, name: `acc-${Math.round(Math.random() * 1e6)}`, type, opening_balance: opening })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id;
}

export async function newStudent(
  service: SupabaseClient,
  schoolId: string,
  name = 'Student',
): Promise<string> {
  const { data, error } = await service
    .from('student')
    .insert({ school_id: schoolId, name })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id;
}

/**
 * Insert installment rows directly for a student (bypasses the enrollment trigger)
 * so money tests can control exact charges/due dates. Returns the created ids in
 * order. Installment has an INSERT grant, but we use the service client anyway.
 */
export async function addInstallments(
  service: SupabaseClient,
  schoolId: string,
  studentId: string,
  rows: { sequence: number; due_date: string; amount: number }[],
): Promise<string[]> {
  const { data, error } = await service
    .from('installment')
    .insert(
      rows.map((r) => ({
        school_id: schoolId,
        student_id: studentId,
        sequence: r.sequence,
        due_date: r.due_date,
        amount_charged: r.amount,
      })),
    )
    .select('id, sequence')
    .order('sequence', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((d) => d.id as string);
}

/** Delete all tenant rows created for a school, children-first. */
export async function cleanupSchool(service: SupabaseClient, schoolId: string): Promise<void> {
  await service.from('audit_entry').delete().eq('school_id', schoolId);
  await service.from('payment_allocation').delete().eq('school_id', schoolId);
  await service.from('discount').delete().eq('school_id', schoolId);
  await service.from('money_event').delete().eq('school_id', schoolId);
  await service.from('receipt_counter').delete().eq('school_id', schoolId);
  await service.from('installment').delete().eq('school_id', schoolId);
  await service.from('enrollment').delete().eq('school_id', schoolId);
  await service.from('installment_schedule').delete().eq('school_id', schoolId);
  await service.from('fee_structure').delete().eq('school_id', schoolId);
  await service.from('student').delete().eq('school_id', schoolId);
  await service.from('section').delete().eq('school_id', schoolId);
  await service.from('academic_year').delete().eq('school_id', schoolId);
  await service.from('account').delete().eq('school_id', schoolId);
  await service.from('subscription').delete().eq('school_id', schoolId);
  await service.from('school').delete().eq('id', schoolId);
}
