'use server';

import { revalidatePath } from 'next/cache';
import {
  CreateAcademicYearInput,
  CreateSectionInput,
  StudentInput,
  AccountInput,
  FeeStructureInput,
  EnrollStudentInput,
} from '@erp/shared/schemas';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requireRole } from '../auth/guard.js';

/**
 * Light CRUD for the school spine (US2). No money math in JS (Article VI) —
 * installment generation happens in the DB trigger on enrollment. RLS enforces
 * tenant scope; requireRole is defense-in-depth.
 */

async function schoolCtx() {
  const ctx = await requireRole('school_admin', 'accountant');
  const supabase = createSupabaseServerClient();
  if (!ctx.schoolId) throw new Error('no school context');
  return { ctx, supabase, schoolId: ctx.schoolId };
}

export async function createAcademicYear(input: {
  label: string;
  is_current?: boolean;
}): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  const v = CreateAcademicYearInput.parse(input);

  // Enforce single-current: clear others when marking this current.
  if (v.is_current) {
    await supabase
      .from('academic_year')
      .update({ is_current: false })
      .eq('school_id', schoolId)
      .eq('is_current', true);
  }
  const { error } = await supabase
    .from('academic_year')
    .insert({ school_id: schoolId, label: v.label, is_current: v.is_current });
  if (error) throw new Error(error.message);
  revalidatePath('/settings/years');
}

export async function setCurrentYear(yearId: string): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  await supabase
    .from('academic_year')
    .update({ is_current: false })
    .eq('school_id', schoolId)
    .eq('is_current', true);
  const { error } = await supabase
    .from('academic_year')
    .update({ is_current: true })
    .eq('school_id', schoolId)
    .eq('id', yearId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/years');
}

export async function createSection(input: { grade_id: string; name: string }): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  const v = CreateSectionInput.parse(input);
  const { error } = await supabase
    .from('section')
    .insert({ school_id: schoolId, grade_id: v.grade_id, name: v.name });
  if (error) throw new Error(error.message);
  revalidatePath('/settings/grades');
}

export async function createAccount(input: {
  name: string;
  type: 'cash' | 'bank';
  account_number?: string;
  opening_balance?: string;
}): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  const v = AccountInput.parse({ ...input, opening_balance: input.opening_balance ?? '0' });
  const { error } = await supabase.from('account').insert({
    school_id: schoolId,
    name: v.name,
    type: v.type,
    account_number: v.account_number ?? null,
    // Money stays a decimal string on the wire (Article I); Postgres parses it
    // into NUMERIC. The generated column type is `number`, so cast at the edge.
    opening_balance: v.opening_balance as unknown as number,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/settings/accounts');
}

export async function upsertStudent(input: {
  id?: string;
  name: string;
  guardian_name?: string;
  guardian_phone?: string;
  status?: 'active' | 'withdrawn' | 'graduated';
}): Promise<{ id: string }> {
  const { supabase, schoolId } = await schoolCtx();
  const v = StudentInput.parse(input);
  const row = {
    school_id: schoolId,
    name: v.name,
    guardian_name: v.guardian_name ?? null,
    guardian_phone: v.guardian_phone ?? null,
    status: v.status,
  };
  if (input.id) {
    const { error } = await supabase.from('student').update(row).eq('id', input.id);
    if (error) throw new Error(error.message);
    revalidatePath('/students');
    return { id: input.id };
  }
  const { data, error } = await supabase
    .from('student')
    .insert(row)
    .select('id')
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? 'failed to create student');
  revalidatePath('/students');
  return { id: data.id };
}

export async function createFeeStructure(input: {
  grade_id: string;
  academic_year_id: string;
  items: { name: string; amount: string }[];
  schedule: { sequence: number; due_date: string; amount: string }[];
}): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  const v = FeeStructureInput.parse(input);

  const { data: fs, error: fsErr } = await supabase
    .from('fee_structure')
    .insert({ school_id: schoolId, grade_id: v.grade_id, academic_year_id: v.academic_year_id })
    .select('id')
    .single<{ id: string }>();
  if (fsErr || !fs) throw new Error(fsErr?.message ?? 'failed to create fee structure');

  const { error: itemsErr } = await supabase.from('fee_item').insert(
    v.items.map((it) => ({
      school_id: schoolId,
      fee_structure_id: fs.id,
      name: it.name,
      amount: it.amount as unknown as number, // decimal string → NUMERIC (Article I)
    })),
  );
  if (itemsErr) throw new Error(itemsErr.message);

  const { error: schedErr } = await supabase.from('installment_schedule').insert(
    v.schedule.map((s) => ({
      school_id: schoolId,
      fee_structure_id: fs.id,
      sequence: s.sequence,
      due_date: s.due_date,
      amount: s.amount as unknown as number, // decimal string → NUMERIC (Article I)
    })),
  );
  if (schedErr) throw new Error(schedErr.message);

  revalidatePath('/settings/fees');
}

/** Enroll a student — the DB trigger generates installments (FR-018). */
export async function enrollStudent(input: {
  student_id: string;
  grade_id: string;
  section_id: string;
  academic_year_id: string;
}): Promise<void> {
  const { supabase, schoolId } = await schoolCtx();
  const v = EnrollStudentInput.parse(input);
  const { error } = await supabase.from('enrollment').insert({
    school_id: schoolId,
    student_id: v.student_id,
    grade_id: v.grade_id,
    section_id: v.section_id,
    academic_year_id: v.academic_year_id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/students/${v.student_id}`);
}
