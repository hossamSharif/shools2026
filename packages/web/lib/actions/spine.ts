'use server';

import { revalidatePath } from 'next/cache';
import {
  CreateAcademicYearInput,
  CreateSectionInput,
  StudentInput,
  AccountInput,
  FeeStructureInput,
  EnrollStudentInput,
  RegisterStudentInput,
} from '@erp/shared/schemas';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requirePermission } from '../auth/guard.js';
import { throwAccessError } from '../auth/access-errors.js';

/**
 * Light CRUD for the school spine (US2). No money math in JS (Article VI) —
 * installment generation happens in the DB trigger on enrollment. RLS enforces
 * tenant scope; requirePermission is defense-in-depth (contracts/web-routes.md).
 */

type SpineKey = 'structure.write' | 'finance.write' | 'students.write';

async function schoolCtx(permission: SpineKey) {
  const ctx = await requirePermission(permission);
  const supabase = createSupabaseServerClient();
  if (!ctx.schoolId) throw new Error('no school context');
  return { ctx, supabase, schoolId: ctx.schoolId };
}

export async function createAcademicYear(input: {
  label: string;
  is_current?: boolean;
}): Promise<void> {
  const { supabase, schoolId } = await schoolCtx('structure.write');
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
  const { supabase, schoolId } = await schoolCtx('structure.write');
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
  const { supabase, schoolId } = await schoolCtx('structure.write');
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
  const { supabase, schoolId } = await schoolCtx('finance.write');
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
  const { supabase, schoolId } = await schoolCtx('students.write');
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

/**
 * Archive / restore a student (US2 enhancement). This is the supported way to
 * take a student off the active roster: their financial history stays intact
 * and they keep appearing on statements and the receivables report while they
 * owe anything (spec Edge case).
 */
export async function setStudentStatus(
  studentId: string,
  status: 'active' | 'withdrawn' | 'graduated',
): Promise<void> {
  const { supabase, schoolId } = await schoolCtx('students.write');
  const { error } = await supabase
    .from('student')
    .update({ status })
    .eq('id', studentId)
    .eq('school_id', schoolId);
  if (error) throw new Error(error.message);
  revalidatePath('/students');
  revalidatePath(`/students/${studentId}`);
}

/**
 * Delete a student — only ever allowed for a record with no financial
 * footprint (a typo, a duplicate). `student` cascades to `installment` and
 * `discount`, so deleting one that has money attached would destroy immutable
 * records (Article III).
 *
 * The `student_delete_guard` trigger (migration 0030) is the actual
 * enforcement; the pre-check here exists purely to produce a specific Arabic
 * message instead of a raw Postgres error, and to keep the UI honest about
 * which rows are deletable.
 */
export async function deleteStudent(studentId: string): Promise<void> {
  // Deletion is the one student operation an accountant must not have.
  const ctx = await requirePermission('students.delete');
  if (!ctx.schoolId) throw new Error('no school context');
  const schoolId = ctx.schoolId;
  const supabase = createSupabaseServerClient();

  const [{ count: instCount }, { count: eventCount }, { count: discountCount }] = await Promise.all(
    [
      supabase
        .from('installment')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId),
      supabase
        .from('money_event')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId),
      supabase
        .from('discount')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId),
    ],
  );

  if ((instCount ?? 0) > 0 || (eventCount ?? 0) > 0 || (discountCount ?? 0) > 0) {
    throw new Error('الطالب لديه سجل مالي — لا يمكن الحذف. استخدم الأرشفة بدلاً من ذلك.');
  }

  const { error } = await supabase
    .from('student')
    .delete()
    .eq('id', studentId)
    .eq('school_id', schoolId);
  if (error) {
    // The trigger fired — a money row landed between the check and the delete.
    if (error.message.includes('STUDENT_HAS_FINANCIAL_HISTORY')) {
      throw new Error('الطالب لديه سجل مالي — لا يمكن الحذف. استخدم الأرشفة بدلاً من ذلك.');
    }
    throw new Error(error.message);
  }
  revalidatePath('/students');
}

export async function createFeeStructure(input: {
  grade_id: string;
  academic_year_id: string;
  items: { name: string; amount: string }[];
  schedule: { sequence: number; due_date: string; amount: string }[];
}): Promise<void> {
  const { supabase, schoolId } = await schoolCtx('finance.write');
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
  const { supabase, schoolId } = await schoolCtx('students.write');
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

/**
 * Register + enroll in one transaction (spec 002, T068) through
 * `register_student`. This is the path for stage-scoped writers, who cannot
 * insert a bare student: Postgres checks `students.write`, the grade's stage
 * against the caller's scope, the school and write gating, and the enrollment
 * trigger generates the installments as for any enrollment.
 */
export async function registerStudent(input: {
  name: string;
  guardian_name?: string;
  guardian_phone?: string;
  grade_id: string;
  section_id: string;
  academic_year_id: string;
}): Promise<{ id: string }> {
  const { supabase } = await schoolCtx('students.write');
  const v = RegisterStudentInput.parse(input);
  const { data, error } = await supabase.rpc('register_student', {
    p_student: {
      name: v.name,
      guardian_name: v.guardian_name ?? null,
      guardian_phone: v.guardian_phone ?? null,
    },
    p_enrollment: {
      grade_id: v.grade_id,
      section_id: v.section_id,
      academic_year_id: v.academic_year_id,
    },
  });
  if (error) await throwAccessError(error);
  if (typeof data !== 'string') throw new Error('failed to register');
  revalidatePath('/students');
  return { id: data };
}
