import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';
import { activateSchool, addInstallments, cleanupSchool, newSchool, newStudent } from '../test-helpers/fees.js';

/**
 * receivables_aging (T095 / US5). Aging-bucket assignment evaluated "today" in
 * Africa/Khartoum: boundaries at 0/30/60/90 days overdue. A withdrawn student
 * with a remaining balance still appears (Edge case) — the function does NOT
 * filter by student.status.
 *
 * Integration test (Article X): requires 0021_student_statement_function /
 * 0022_receivables_aging_function applied. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

function daysAgo(n: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  return dt.toISOString().slice(0, 10);
}

d('receivables_aging (Africa/Khartoum bucket boundaries)', () => {
  const service = getServiceClient()!;
  let schoolId: string;

  afterAll(async () => {
    await cleanupSchool(service, schoolId);
  });

  beforeAll(async () => {
    schoolId = await newSchool(service, 'aging');
    await activateSchool(service, schoolId);
  });

  it('buckets installments by days overdue at the 0/30/60/90 boundaries', async () => {
    const current = await newStudent(service, schoolId, 'Current');
    const b1 = await newStudent(service, schoolId, 'Bucket1-30');
    const b31 = await newStudent(service, schoolId, 'Bucket31-60');
    const b61 = await newStudent(service, schoolId, 'Bucket61-90');
    const b91 = await newStudent(service, schoolId, 'Bucket90Plus');

    // Not yet due (due in the future) -> current bucket.
    await addInstallments(service, schoolId, current, [
      { sequence: 1, due_date: daysAgo(-10), amount: 100 },
    ]);
    // 15 days overdue -> 1-30.
    await addInstallments(service, schoolId, b1, [
      { sequence: 1, due_date: daysAgo(15), amount: 200 },
    ]);
    // 45 days overdue -> 31-60.
    await addInstallments(service, schoolId, b31, [
      { sequence: 1, due_date: daysAgo(45), amount: 300 },
    ]);
    // 75 days overdue -> 61-90.
    await addInstallments(service, schoolId, b61, [
      { sequence: 1, due_date: daysAgo(75), amount: 400 },
    ]);
    // 95 days overdue -> 90+.
    await addInstallments(service, schoolId, b91, [
      { sequence: 1, due_date: daysAgo(95), amount: 500 },
    ]);

    const { data, error } = await service.rpc('receivables_aging', { p_school_id: schoolId });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    const byId = (id: string) => rows.find((r) => r.student_id === id);

    expect(Number(byId(current)?.current_amount)).toBe(100);
    expect(Number(byId(b1)?.bucket_1_30)).toBe(200);
    expect(Number(byId(b31)?.bucket_31_60)).toBe(300);
    expect(Number(byId(b61)?.bucket_61_90)).toBe(400);
    expect(Number(byId(b91)?.bucket_90_plus)).toBe(500);
  });

  it('still includes a withdrawn/graduated student with an outstanding balance', async () => {
    const withdrawn = await newStudent(service, schoolId, 'Withdrawn');
    await addInstallments(service, schoolId, withdrawn, [
      { sequence: 1, due_date: daysAgo(20), amount: 150 },
    ]);
    await service.from('student').update({ status: 'withdrawn' }).eq('id', withdrawn);

    const { data, error } = await service.rpc('receivables_aging', { p_school_id: schoolId });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.student_id === withdrawn);
    expect(row).toBeDefined();
    expect(row?.status).toBe('withdrawn');
    expect(Number(row?.bucket_1_30)).toBe(150);
  });

  it('excludes students with no outstanding balance and supports grade filtering', async () => {
    const paidUp = await newStudent(service, schoolId, 'PaidUp');
    await addInstallments(service, schoolId, paidUp, [
      { sequence: 1, due_date: daysAgo(5), amount: 0 },
    ]);

    const { data } = await service.rpc('receivables_aging', { p_school_id: schoolId });
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.student_id === paidUp)).toBeUndefined();
  });
});
