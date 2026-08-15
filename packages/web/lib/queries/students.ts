import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Students directory + profile read queries. Thin RPC wrappers in the same
 * shape as `lib/queries/statement.ts` — every figure below is derived in
 * Postgres (`student_directory`, `student_financial_summary`,
 * `student_installments`, `student_payments`). No money math here (Article VI).
 */

export type FinStatus = 'paid' | 'partial' | 'overdue' | 'unpaid';
export type StudentStatus = 'active' | 'withdrawn' | 'graduated';

export interface StudentDirectoryRow {
  student_id: string;
  name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  status: StudentStatus;
  grade_id: string | null;
  grade_label: string | null;
  section_id: string | null;
  section_name: string | null;
  academic_year_id: string | null;
  total_charged: string;
  total_paid: string;
  total_discount: string;
  total_owed: string;
  overdue_amount: string;
  days_overdue: number;
  next_due_date: string | null;
  next_due_amount: string;
  installments_total: number;
  installments_settled: number;
  fin_status: FinStatus | null;
}

export interface StudentDirectoryFilters {
  q?: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
  academicYearId?: string;
  status?: string;
  finStatus?: string;
  dueWithinDays?: number;
  unenrolled?: boolean;
  missingPhone?: boolean;
  sort?: string;
}

export async function studentDirectory(
  schoolId: string,
  f: StudentDirectoryFilters = {},
): Promise<StudentDirectoryRow[]> {
  const supabase = createSupabaseServerClient();
  // Empty filters are omitted rather than sent as null, so each unset
  // parameter falls through to its SQL DEFAULT.
  const { data, error } = await supabase.rpc('student_directory', {
    p_school_id: schoolId,
    p_q: f.q || undefined,
    p_stage_id: f.stageId || undefined,
    p_grade_id: f.gradeId || undefined,
    p_section_id: f.sectionId || undefined,
    p_academic_year_id: f.academicYearId || undefined,
    p_status: f.status || undefined,
    p_fin_status: f.finStatus || undefined,
    p_due_within_days: f.dueWithinDays ?? undefined,
    p_unenrolled: f.unenrolled ?? false,
    p_missing_phone: f.missingPhone ?? false,
    p_sort: f.sort || 'name',
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudentDirectoryRow[];
}

export interface StudentFinancialSummary {
  total_charged: string;
  total_discount: string;
  total_paid: string;
  total_refunded: string;
  total_adjusted: string;
  total_owed: string;
  collection_rate: string;
  installments_total: number;
  installments_settled: number;
  next_due_date: string | null;
  next_due_amount: string;
  overdue_amount: string;
  days_overdue: number;
  oldest_overdue_date: string | null;
}

export async function studentFinancialSummary(
  studentId: string,
): Promise<StudentFinancialSummary> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('student_financial_summary', {
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as StudentFinancialSummary[];
  // The function always returns exactly one row (aggregates over an empty set
  // still produce zeros), but guard so a student with no data can't crash the page.
  return (
    rows[0] ?? {
      total_charged: '0',
      total_discount: '0',
      total_paid: '0',
      total_refunded: '0',
      total_adjusted: '0',
      total_owed: '0',
      collection_rate: '0',
      installments_total: 0,
      installments_settled: 0,
      next_due_date: null,
      next_due_amount: '0',
      overdue_amount: '0',
      days_overdue: 0,
      oldest_overdue_date: null,
    }
  );
}

export type InstallmentStatus = 'paid' | 'partial' | 'overdue' | 'upcoming';

export interface StudentInstallmentRow {
  installment_id: string;
  sequence: number;
  due_date: string;
  amount_charged: string;
  amount_paid: string;
  amount_discount: string;
  remaining: string;
  is_carried_in: boolean;
  status: InstallmentStatus;
}

export async function studentInstallmentSchedule(studentId: string): Promise<StudentInstallmentRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('student_installments', {
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudentInstallmentRow[];
}

export interface StudentPaymentRow {
  money_event_id: string;
  receipt_no: number | null;
  occurred_at: string;
  amount: string;
  account_name: string | null;
  is_reversal: boolean;
  is_reversed: boolean;
  notes: string | null;
}

export async function studentPayments(studentId: string): Promise<StudentPaymentRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('student_payments', { p_student_id: studentId });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudentPaymentRow[];
}
