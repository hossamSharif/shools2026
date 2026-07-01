import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getServiceClient, INTEGRATION_ENV_READY } from '../test-helpers/supabase.js';

/**
 * generate_installments trigger (T044 / US2). Enrolling a student WITH a matching
 * fee structure materializes installments equal to the schedule (count, amounts,
 * due dates). Enrolling with NO matching fee structure is a no-op (zero rows).
 *
 * Uses the service client to arrange tenant data (bypasses RLS); the enrollment
 * insert fires the AFTER INSERT trigger → generate_installments (SECURITY DEFINER).
 *
 * Integration test (Article X): requires 0005-0010 + generate_installments applied
 * and the `grade` reference seed. Skips when env unset.
 */
const d = INTEGRATION_ENV_READY ? describe : describe.skip;

d('generate_installments (on enrollment)', () => {
  const service = getServiceClient()!;
  let schoolId: string;
  let gradeId: string;
  let yearId: string;
  let sectionId: string;

  const schedule = [
    { sequence: 1, due_date: '2026-09-01', amount: 300 },
    { sequence: 2, due_date: '2026-12-01', amount: 300 },
    { sequence: 3, due_date: '2027-03-01', amount: 400 },
  ];

  beforeAll(async () => {
    const { data: school, error } = await service
      .from('school')
      .insert({ name: `t-geninst-${Date.now()}` })
      .select('id')
      .single();
    if (error) throw error;
    schoolId = school!.id;

    const { data: grade } = await service.from('grade').select('id').limit(1).single();
    gradeId = grade!.id;

    const { data: year } = await service
      .from('academic_year')
      .insert({ school_id: schoolId, label: '2026/2027', is_current: true })
      .select('id')
      .single();
    yearId = year!.id;

    const { data: section } = await service
      .from('section')
      .insert({ school_id: schoolId, grade_id: gradeId, name: 'A' })
      .select('id')
      .single();
    sectionId = section!.id;
  });

  afterAll(async () => {
    // Children first (FKs), then school (cascade covers most, but be explicit).
    await service.from('installment').delete().eq('school_id', schoolId);
    await service.from('enrollment').delete().eq('school_id', schoolId);
    await service.from('installment_schedule').delete().eq('school_id', schoolId);
    await service.from('fee_structure').delete().eq('school_id', schoolId);
    await service.from('student').delete().eq('school_id', schoolId);
    await service.from('section').delete().eq('school_id', schoolId);
    await service.from('academic_year').delete().eq('school_id', schoolId);
    if (schoolId) await service.from('school').delete().eq('id', schoolId);
  });

  async function newStudent(name: string): Promise<string> {
    const { data } = await service
      .from('student')
      .insert({ school_id: schoolId, name })
      .select('id')
      .single();
    return data!.id;
  }

  async function enroll(studentId: string): Promise<string> {
    const { data, error } = await service
      .from('enrollment')
      .insert({
        school_id: schoolId,
        student_id: studentId,
        grade_id: gradeId,
        section_id: sectionId,
        academic_year_id: yearId,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data!.id;
  }

  it('creates installments matching the schedule when a fee structure exists', async () => {
    const { data: fs } = await service
      .from('fee_structure')
      .insert({ school_id: schoolId, grade_id: gradeId, academic_year_id: yearId })
      .select('id')
      .single();
    const feeStructureId = fs!.id;
    await service.from('installment_schedule').insert(
      schedule.map((s) => ({ ...s, school_id: schoolId, fee_structure_id: feeStructureId })),
    );

    const studentId = await newStudent('WithStructure');
    const enrollmentId = await enroll(studentId);

    const { data: rows } = await service
      .from('installment')
      .select('sequence, due_date, amount_charged')
      .eq('enrollment_id', enrollmentId)
      .order('sequence', { ascending: true });

    expect((rows ?? []).length).toBe(schedule.length);
    for (let i = 0; i < schedule.length; i++) {
      expect(rows![i].sequence).toBe(schedule[i].sequence);
      expect(rows![i].due_date).toBe(schedule[i].due_date);
      expect(Number(rows![i].amount_charged)).toBe(schedule[i].amount);
    }
  });

  it('creates zero installments when no matching fee structure exists (edge)', async () => {
    // A separate year with NO fee structure → trigger no-ops.
    const { data: year2 } = await service
      .from('academic_year')
      .insert({ school_id: schoolId, label: '2099/2100', is_current: false })
      .select('id')
      .single();

    const studentId = await newStudent('NoStructure');
    const { data: enr, error } = await service
      .from('enrollment')
      .insert({
        school_id: schoolId,
        student_id: studentId,
        grade_id: gradeId,
        section_id: sectionId,
        academic_year_id: year2!.id,
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    const { data: rows } = await service
      .from('installment')
      .select('id')
      .eq('enrollment_id', enr!.id);
    expect((rows ?? []).length).toBe(0);
  });
});
