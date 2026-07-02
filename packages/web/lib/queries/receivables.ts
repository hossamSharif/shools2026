import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Receivables aging read query (US5, T097). Buckets/totals are computed by
 * `receivables_aging` (DB function, Africa/Khartoum) — thin wrapper only
 * (Article VI/II).
 */

export interface ReceivableRow {
  student_id: string;
  student_name: string;
  status: 'active' | 'withdrawn' | 'graduated';
  grade_id: string | null;
  grade_label: string | null;
  section_id: string | null;
  section_name: string | null;
  current_amount: string;
  bucket_1_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_90_plus: string;
  total_owed: string;
}

export interface ReceivablesFilter {
  schoolId: string;
  stageId?: string;
  gradeId?: string;
  sectionId?: string;
}

export async function receivablesAging(filter: ReceivablesFilter): Promise<ReceivableRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('receivables_aging', {
    p_school_id: filter.schoolId,
    ...(filter.stageId ? { p_stage_id: filter.stageId } : {}),
    ...(filter.gradeId ? { p_grade_id: filter.gradeId } : {}),
    ...(filter.sectionId ? { p_section_id: filter.sectionId } : {}),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReceivableRow[];
}

export interface ReceivablesBucketTotals {
  current: number;
  b1_30: number;
  b31_60: number;
  b61_90: number;
  b90_plus: number;
  total: number;
}

/** Per-bucket totals across the filtered rows (client-side sum, display only). */
export function bucketTotals(rows: ReceivableRow[]): ReceivablesBucketTotals {
  return rows.reduce(
    (acc, r) => ({
      current: acc.current + Number(r.current_amount),
      b1_30: acc.b1_30 + Number(r.bucket_1_30),
      b31_60: acc.b31_60 + Number(r.bucket_31_60),
      b61_90: acc.b61_90 + Number(r.bucket_61_90),
      b90_plus: acc.b90_plus + Number(r.bucket_90_plus),
      total: acc.total + Number(r.total_owed),
    }),
    { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 },
  );
}
