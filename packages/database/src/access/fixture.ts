import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAuthedStaff,
  linkPortal,
  setSubscriptionState,
  type AuthedUser,
} from '../test-helpers/supabase.js';
import { addInstallments, cleanupSchool, newAccount, newSchool } from '../test-helpers/fees.js';

/**
 * Access fixture for feature 002 (quickstart §3). Builds the population every
 * access test runs against: School A with students X/Y/Z across Primary and
 * Middle plus finance rows, School B with one paid student, and one user per
 * role. Every call uses unique schools and emails, so suites can run in
 * parallel. Exported to Playwright through `@erp/database/test-fixtures`.
 */

// Re-exported for Playwright (`@erp/database/test-fixtures`).
export {
  createAuthedStaff,
  getServiceClient,
  INTEGRATION_ENV_READY,
  linkPortal,
  setSubscriptionState,
  type AccessRole,
  type AuthedUser,
  type CreateAuthedStaffOptions,
} from '../test-helpers/supabase.js';

export const FIXTURE_USERS = [
  'adminA',
  'adminA2',
  'principal',
  'principalPrimary',
  'principalViewer',
  'sa',
  'saMiddle',
  'teacher',
  'accountant',
  'viewer',
  'teacherSa',
  'guardianX',
  'studentY',
  'adminB',
  'superAdmin',
] as const;
export type FixtureUser = (typeof FIXTURE_USERS)[number];

/** Fixture student letters used by `ACCESS_EXPECTATIONS.rowsOf`. */
export type FixtureStudent = 'X' | 'Y' | 'Z' | 'B';

export interface PaymentHandle {
  moneyEventId: string;
  receiptNo: number | string;
}

export interface AccessFixture {
  schoolA: string;
  schoolB: string;
  stages: { primary: string; middle: string };
  grades: { primary: string; middle: string };
  yearA: string;
  sections: { primary: string; middle: string };
  feeStructures: { primary: string; middle: string };
  accounts: { A: string; B: string };
  students: Record<FixtureStudent, string>;
  enrollments: { X: string; Y: string };
  installments: { X: string[]; Y: string[]; B: string[] };
  payments: { X: PaymentHandle; B: PaymentHandle };
  smsLogId: string;
  portalLinks: { guardianX: string; studentY: string };
  users: Record<FixtureUser, AuthedUser>;
  cleanup: () => Promise<void>;
}

const tag = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function one<T = { id: string }>(
  q: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
): Promise<T> {
  const { data, error } = await q;
  if (error) throw Object.assign(new Error(`fixture: ${what} failed`), { cause: error });
  if (data == null) throw new Error(`fixture: ${what} returned no row`);
  return data as T;
}

async function stageAndGrade(
  service: SupabaseClient,
  stageCode: 'primary' | 'middle',
  gradeCode: string,
): Promise<{ stageId: string; gradeId: string }> {
  const stage = await one(
    service.from('stage').select('id').eq('code', stageCode).single(),
    `stage ${stageCode}`,
  );
  const grade = await one(
    service.from('grade').select('id').eq('code', gradeCode).single(),
    `grade ${gradeCode}`,
  );
  return { stageId: stage.id, gradeId: grade.id };
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function feeStructure(
  service: SupabaseClient,
  schoolId: string,
  gradeId: string,
  yearId: string,
): Promise<string> {
  const fs = (await one(
    service
      .from('fee_structure')
      .insert({ school_id: schoolId, grade_id: gradeId, academic_year_id: yearId })
      .select('id')
      .single(),
    'fee_structure',
  )) as { id: string };
  const { error: itemErr } = await service
    .from('fee_item')
    .insert({ school_id: schoolId, fee_structure_id: fs.id, name: 'رسوم دراسية', amount: 1000 });
  if (itemErr) throw itemErr;
  // One installment already overdue, one in the future (receivables + aging rows).
  const { error: schedErr } = await service.from('installment_schedule').insert([
    {
      school_id: schoolId,
      fee_structure_id: fs.id,
      sequence: 1,
      due_date: isoDate(-40),
      amount: 600,
    },
    {
      school_id: schoolId,
      fee_structure_id: fs.id,
      sequence: 2,
      due_date: isoDate(60),
      amount: 400,
    },
  ]);
  if (schedErr) throw schedErr;
  return fs.id;
}

async function pay(
  client: SupabaseClient,
  studentId: string,
  accountId: string,
  amount: number,
): Promise<PaymentHandle> {
  const { data, error } = await client.rpc('apply_fee_payment', {
    p_student_id: studentId,
    p_account_id: accountId,
    p_amount: amount,
    p_occurred_at: new Date().toISOString(),
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw Object.assign(new Error('fixture: apply_fee_payment failed'), { cause: error });
  const r = data as { money_event_id: string; receipt_no: number | string };
  return { moneyEventId: r.money_event_id, receiptNo: r.receipt_no };
}

export async function buildAccessFixture(service: SupabaseClient): Promise<AccessFixture> {
  const t = tag();
  const created: AuthedUser[] = [];
  let schoolA: string | undefined;
  let schoolB: string | undefined;

  const cleanup = async () => {
    // Schools first: money_event / audit_entry / discount reference the acting
    // user without cascade, so deleting a user that posted a payment fails
    // silently while those rows exist. Deleting the school cascades
    // role_assignment, portal_link and notification; the users go after.
    if (schoolA) await cleanupSchool(service, schoolA);
    if (schoolB) await cleanupSchool(service, schoolB);
    await Promise.allSettled(created.map((u) => u.cleanup()));
  };

  try {
    schoolA = await newSchool(service, `accessA-${t}`);
    schoolB = await newSchool(service, `accessB-${t}`);
    await setSubscriptionState(service, schoolA, 'active');
    await setSubscriptionState(service, schoolB, 'active');

    const primary = await stageAndGrade(service, 'primary', 'p1');
    const middle = await stageAndGrade(service, 'middle', 'm1');

    // ── School A structure (current academic year) ────────────────────────
    const year = (await one(
      service
        .from('academic_year')
        .insert({ school_id: schoolA, label: `2026/2027-${t}`, is_current: true })
        .select('id')
        .single(),
      'academic_year',
    )) as { id: string };
    const secP = (await one(
      service
        .from('section')
        .insert({ school_id: schoolA, grade_id: primary.gradeId, name: 'أ' })
        .select('id')
        .single(),
      'section primary',
    )) as { id: string };
    const secM = (await one(
      service
        .from('section')
        .insert({ school_id: schoolA, grade_id: middle.gradeId, name: 'أ' })
        .select('id')
        .single(),
      'section middle',
    )) as { id: string };
    const fsP = await feeStructure(service, schoolA, primary.gradeId, year.id);
    const fsM = await feeStructure(service, schoolA, middle.gradeId, year.id);
    const accountA = await newAccount(service, schoolA, 500);

    // ── Students ──────────────────────────────────────────────────────────
    const insertStudent = async (schoolId: string, name: string, status = 'active') =>
      (
        (await one(
          service
            .from('student')
            .insert({
              school_id: schoolId,
              name,
              status,
              guardian_name: `ولي أمر ${name}`,
              guardian_phone: '+249912345678',
            })
            .select('id')
            .single(),
          `student ${name}`,
        )) as { id: string }
      ).id;

    const X = await insertStudent(schoolA, 'الطالب س');
    const Y = await insertStudent(schoolA, 'الطالب ص');
    const Z = await insertStudent(schoolA, 'الطالب ع', 'withdrawn');

    // Enrollment fires enrollment_generate_installments (FR-022 path).
    const enroll = async (studentId: string, gradeId: string, sectionId: string) =>
      (
        (await one(
          service
            .from('enrollment')
            .insert({
              school_id: schoolA,
              student_id: studentId,
              grade_id: gradeId,
              section_id: sectionId,
              academic_year_id: year.id,
            })
            .select('id')
            .single(),
          'enrollment',
        )) as { id: string }
      ).id;
    const enrX = await enroll(X, primary.gradeId, secP.id);
    const enrY = await enroll(Y, middle.gradeId, secM.id);

    const installmentIds = async (studentId: string) => {
      const { data, error } = await service
        .from('installment')
        .select('id')
        .eq('student_id', studentId)
        .order('sequence');
      if (error) throw error;
      return (data ?? []).map((r) => r.id as string);
    };
    const instX = await installmentIds(X);
    const instY = await installmentIds(Y);

    // ── School B ──────────────────────────────────────────────────────────
    const accountB = await newAccount(service, schoolB, 900);
    const B = await insertStudent(schoolB, 'طالب المدرسة ب');
    const instB = await addInstallments(service, schoolB, B, [
      { sequence: 1, due_date: isoDate(-10), amount: 700 },
    ]);

    // ── Users (one per role) ──────────────────────────────────────────────
    const mk = async (opts: Parameters<typeof createAuthedStaff>[1]) => {
      const u = await createAuthedStaff(service, opts);
      created.push(u);
      return u;
    };
    const A = schoolA;
    const [
      adminA,
      adminA2,
      principal,
      principalPrimary,
      principalViewer,
      sa,
      saMiddle,
      teacher,
      accountant,
      viewer,
      teacherSa,
      guardianX,
      studentY,
      adminB,
      superAdmin,
    ] = await Promise.all([
      mk({ roles: ['school_admin'], schoolId: A, displayName: 'مدير المدرسة أ' }),
      mk({ roles: ['school_admin'], schoolId: A, displayName: 'مدير المدرسة أ ٢' }),
      mk({ roles: ['principal'], schoolId: A, displayName: 'المدير الأكاديمي' }),
      mk({
        roles: ['principal'],
        schoolId: A,
        stages: { principal: [primary.stageId] },
        displayName: 'المدير الأكاديمي (ابتدائي)',
      }),
      mk({ roles: ['principal', 'viewer'], schoolId: A, displayName: 'مدير أكاديمي ومطّلع' }),
      mk({ roles: ['student_affairs'], schoolId: A, displayName: 'شؤون الطلاب' }),
      mk({
        roles: ['student_affairs'],
        schoolId: A,
        stages: { student_affairs: [middle.stageId] },
        displayName: 'شؤون الطلاب (متوسط)',
      }),
      mk({ roles: ['teacher'], schoolId: A, displayName: 'معلم' }),
      mk({ roles: ['accountant'], schoolId: A, displayName: 'محاسب' }),
      mk({ roles: ['viewer'], schoolId: A, displayName: 'مطّلع' }),
      mk({ roles: ['teacher', 'student_affairs'], schoolId: A, displayName: 'معلم وشؤون طلاب' }),
      mk({ roles: ['guardian'], schoolId: A, displayName: 'ولي أمر س' }),
      mk({ roles: ['student'], schoolId: A, displayName: 'الطالب ص' }),
      mk({ roles: ['school_admin'], schoolId: schoolB, displayName: 'مدير المدرسة ب' }),
      mk({ roles: ['super_admin'], schoolId: null, displayName: 'مدير النظام' }),
    ]);

    const linkX = await linkPortal(service, {
      userId: guardianX.userId,
      studentId: X,
      schoolId: A,
      kind: 'guardian',
    });
    const linkY = await linkPortal(service, {
      userId: studentY.userId,
      studentId: Y,
      schoolId: A,
      kind: 'self',
    });

    // ── Money (through the real RPC as the accountant / B's admin) ────────
    const paymentX = await pay(accountant.client, X, accountA, 250);
    const paymentB = await pay(adminB.client, B, accountB, 300);

    // ── SMS log + one notification of each type per School A user ─────────
    const sms = (await one(
      service
        .from('sms_message_log')
        .insert({
          school_id: A,
          student_id: X,
          recipient_phone: '+249912345678',
          message_text: 'تذكير بموعد سداد القسط',
          segments: 1,
          status: 'sent',
          is_manual: true,
          idempotency_key: crypto.randomUUID(),
        })
        .select('id')
        .single(),
      'sms_message_log',
    )) as { id: string };

    const schoolAUsers = [
      adminA,
      adminA2,
      principal,
      principalPrimary,
      principalViewer,
      sa,
      saMiddle,
      teacher,
      accountant,
      viewer,
      teacherSa,
      guardianX,
      studentY,
    ];
    const { error: notifErr } = await service.from('notification').insert(
      schoolAUsers.flatMap((u) =>
        (['payment_recorded', 'low_sms_credit', 'subscription_expiring'] as const).map((type) => ({
          school_id: A,
          user_id: u.userId,
          type,
          payload: { fixture: true },
        })),
      ),
    );
    if (notifErr) throw notifErr;

    return {
      schoolA: A,
      schoolB,
      stages: { primary: primary.stageId, middle: middle.stageId },
      grades: { primary: primary.gradeId, middle: middle.gradeId },
      yearA: year.id,
      sections: { primary: secP.id, middle: secM.id },
      feeStructures: { primary: fsP, middle: fsM },
      accounts: { A: accountA, B: accountB },
      students: { X, Y, Z, B },
      enrollments: { X: enrX, Y: enrY },
      installments: { X: instX, Y: instY, B: instB },
      payments: { X: paymentX, B: paymentB },
      smsLogId: sms.id,
      portalLinks: { guardianX: linkX, studentY: linkY },
      users: {
        adminA,
        adminA2,
        principal,
        principalPrimary,
        principalViewer,
        sa,
        saMiddle,
        teacher,
        accountant,
        viewer,
        teacherSa,
        guardianX,
        studentY,
        adminB,
        superAdmin,
      },
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
