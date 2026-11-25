/**
 * Access matrix as data (feature 002, FR-034, SC-001).
 *
 * `ACCESS_EXPECTATIONS` says, for every fixture user of
 * `buildAccessFixture` (@erp/database/test-fixtures) and every data set /
 * derived function, what a direct query with that user's own session must
 * return. The rules below are transcribed from contracts/access-matrix.md §1
 * and §3; the database implements them independently in SQL, and
 * `src/access/matrix.test.ts` compares the two.
 *
 * Letters in `rowsOf` name fixture rows: X (Primary, enrolled), Y (Middle,
 * enrolled), Z (Primary, withdrawn, not enrolled) in School A, and B (School
 * B's student). For a table, the letter means "the rows of that student" (its
 * enrollment, its section, ...). The runner maps letters to ids.
 */
import {
  OPTIONAL_PERMISSIONS,
  ROLE_DEFAULTS,
  type PermissionKey,
  type Role,
  type StageScopableRole,
} from './keys.js';

// ---------------------------------------------------------------------------
// Fixture population (mirrors quickstart §3)
// ---------------------------------------------------------------------------

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

export type FixtureStudent = 'X' | 'Y' | 'Z' | 'B';
export type FixtureStage = 'primary' | 'middle';

export interface FixtureProfile {
  readonly roles: readonly Role[];
  readonly school: 'A' | 'B' | null;
  readonly stages?: Partial<Record<StageScopableRole, readonly FixtureStage[]>>;
}

export const FIXTURE_PROFILES: Readonly<Record<FixtureUser, FixtureProfile>> = {
  adminA: { roles: ['school_admin'], school: 'A' },
  adminA2: { roles: ['school_admin'], school: 'A' },
  principal: { roles: ['principal'], school: 'A' },
  principalPrimary: { roles: ['principal'], school: 'A', stages: { principal: ['primary'] } },
  principalViewer: { roles: ['principal', 'viewer'], school: 'A' },
  sa: { roles: ['student_affairs'], school: 'A' },
  saMiddle: { roles: ['student_affairs'], school: 'A', stages: { student_affairs: ['middle'] } },
  teacher: { roles: ['teacher'], school: 'A' },
  accountant: { roles: ['accountant'], school: 'A' },
  viewer: { roles: ['viewer'], school: 'A' },
  teacherSa: { roles: ['teacher', 'student_affairs'], school: 'A' },
  guardianX: { roles: ['guardian'], school: 'A' },
  studentY: { roles: ['student'], school: 'A' },
  adminB: { roles: ['school_admin'], school: 'B' },
  superAdmin: { roles: ['super_admin'], school: null },
};

/** Which fixture student sits in which stage (current-year enrollment). */
const STUDENT_STAGE: Readonly<Record<'X' | 'Y' | 'Z', FixtureStage | null>> = {
  X: 'primary',
  Y: 'middle',
  Z: null, // withdrawn, not enrolled: matches only school-wide scopes (R7)
};

/** Portal links built by the fixture. */
const PORTAL_LINKS: Readonly<Partial<Record<FixtureUser, readonly FixtureStudent[]>>> = {
  guardianX: ['X'],
  studentY: ['Y'],
};

// ---------------------------------------------------------------------------
// Data sets and derived functions
// ---------------------------------------------------------------------------

/**
 * Every tenant table of data-model §10 that exists after US1, plus reference
 * tables and storage buckets. Later stories append theirs (US3: invitation,
 * access_audit_entry; US4: storage:student-photos, teacher_roster).
 */
export const DATA_SETS = [
  'school',
  'subscription',
  'academic_year',
  'section',
  'student',
  'enrollment',
  'account',
  'fee_structure',
  'fee_item',
  'installment_schedule',
  'reminder_rule',
  'installment',
  'money_event',
  'payment_allocation',
  'receipt_counter',
  'discount',
  'audit_entry',
  'sms_message_log',
  'sms_credit_topup',
  'sms_credit_consumption',
  'notification',
  'user',
  'role_assignment',
  'role_assignment_stage',
  'portal_link',
  'school_role_permission',
  'stage',
  'grade',
  'storage:money-attachments',
  'storage:school-logos',
] as const;
export type DataSet = (typeof DATA_SETS)[number];

/** Read-side derived functions (access-matrix §3). */
export const READ_FUNCTIONS = [
  'student_statement',
  'student_payments',
  'receivables_aging',
  'account_balance',
  'installment_running_balance',
  'student_balance',
  'student_financial_summary',
  'student_installments',
  'dashboard_kpis',
  'student_directory',
  'sms_credit_balance',
] as const;

/** Money RPCs: finance.write + write gating (access-matrix §3). */
export const MONEY_FUNCTIONS = [
  'apply_fee_payment',
  'record_expense',
  'record_transfer',
  'record_refund',
  'record_adjustment',
  'apply_discount',
  'reverse_event',
  'record_opening_balance',
] as const;

/** Not executable by `authenticated` at all (worker / trigger only, 0032a). */
export const INTERNAL_FUNCTIONS = [
  'consume_sms_credit',
  'check_low_sms_credit',
  'generate_installments',
] as const;

export const DERIVED_FUNCTIONS = [
  ...READ_FUNCTIONS,
  ...MONEY_FUNCTIONS,
  'topup_sms_credit',
  ...INTERNAL_FUNCTIONS,
] as const;
export type DerivedFunction = (typeof DERIVED_FUNCTIONS)[number];

export type DataSetOrFn = DataSet | DerivedFunction;

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

/**
 * - `all`: every row of the caller's school (the super-admin: every row it
 *   manages); for functions, the full Phase 1 result.
 * - `scoped`: exactly the rows of `rowsOf`.
 * - `totals`: `dashboard_kpis` totals subset only (access-matrix §3).
 * - `masked`: `student_directory` rows of `rowsOf` with finance columns NULL.
 * - `own`: only the caller's own rows.
 * - `none`: zero rows, with no error that names the table or rows (US1-1).
 * - `refused`: an error whose code starts with FORBIDDEN, or a permission
 *   error (42501) for functions the role cannot execute.
 *
 * For mutating functions `read` is not meaningful and is `none`; `write`
 * carries the expectation.
 */
export type ReadExpectation = 'all' | 'scoped' | 'totals' | 'masked' | 'own' | 'none' | 'refused';

export interface Expectation {
  read: ReadExpectation;
  write?: 'allowed' | 'refused';
  rowsOf?: FixtureStudent[];
  /** notification only: which notification types the caller sees of its own. */
  types?: string[];
}

const MONEY_NOTIFICATION_TYPES = ['payment_recorded', 'low_sms_credit'] as const;
const ALL_NOTIFICATION_TYPES = [...MONEY_NOTIFICATION_TYPES, 'subscription_expiring'] as const;

/** Effective keys of a profile: union of defaults and default-on switches. */
export function effectiveKeys(profile: FixtureProfile): ReadonlySet<PermissionKey> {
  const keys = new Set<PermissionKey>();
  for (const role of profile.roles) {
    for (const k of ROLE_DEFAULTS[role]) keys.add(k);
    for (const o of OPTIONAL_PERMISSIONS) if (o.role === role && o.defaultEnabled) keys.add(o.key);
  }
  return keys;
}

/** Roles of a profile that grant a key (defaults + default-on switches). */
function grantingRoles(profile: FixtureProfile, key: PermissionKey): Role[] {
  return profile.roles.filter(
    (r) =>
      ROLE_DEFAULTS[r].includes(key) ||
      OPTIONAL_PERMISSIONS.some((o) => o.role === r && o.key === key && o.defaultEnabled),
  );
}

/** Stage scope of a key: null = school-wide, else the union of stages. */
function scopeOf(profile: FixtureProfile, key: PermissionKey): FixtureStage[] | null {
  const roles = grantingRoles(profile, key);
  const stages = new Set<FixtureStage>();
  for (const r of roles) {
    const s = (profile.stages as Partial<Record<Role, readonly FixtureStage[]>> | undefined)?.[r];
    if (!s || s.length === 0) return null; // any school-wide grant wins
    for (const x of s) stages.add(x);
  }
  return [...stages];
}

/** Fixture students a profile can read as a student row (can_read_student). */
function readableStudents(profile: FixtureProfile, user: FixtureUser): FixtureStudent[] {
  if (profile.school === 'B') return ['B'];
  if (profile.school !== 'A') return [];
  const out = new Set<FixtureStudent>();
  if (effectiveKeys(profile).has('students.read')) {
    const scope = scopeOf(profile, 'students.read');
    for (const s of ['X', 'Y', 'Z'] as const) {
      const stage = STUDENT_STAGE[s];
      if (scope === null || (stage !== null && scope.includes(stage))) out.add(s);
    }
  }
  for (const s of PORTAL_LINKS[user] ?? []) out.add(s);
  return [...out].sort();
}

/** Students with a current-year enrollment (B is paid directly, not enrolled). */
const ENROLLED: readonly FixtureStudent[] = ['X', 'Y'];

function expectationsFor(user: FixtureUser): Record<DataSetOrFn, Expectation> {
  const profile = FIXTURE_PROFILES[user];
  const keys = effectiveKeys(profile);
  const has = (k: PermissionKey) => keys.has(k);
  const isSuper = profile.roles.includes('super_admin');
  const inSchool = profile.school !== null;
  const finRead: Expectation = has('finance.read') ? { read: 'all' } : { read: 'none' };
  const finConfig: Expectation = {
    ...finRead,
    write: has('finance.write') ? 'allowed' : 'refused',
  };
  const finLedger: Expectation = {
    ...finRead,
    ...(has('finance.write') ? {} : { write: 'refused' as const }),
  };
  const finFn: Expectation = has('finance.read') ? { read: 'all' } : { read: 'refused' };

  const students = readableStudents(profile, user);
  const enrolled = students.filter((s) => ENROLLED.includes(s));
  const studentScoped = (rows: FixtureStudent[]): Expectation =>
    rows.length === 0 ? { read: 'none' } : { read: 'scoped', rowsOf: rows };

  // Structure: teachers are relationship-scoped (no allocations before feature
  // 02), so only non-teacher grants of structure.read count here.
  const structureRoles = grantingRoles(profile, 'structure.read').filter((r) => r !== 'teacher');
  const structureProfile: FixtureProfile = { ...profile, roles: structureRoles };
  const structureScope = structureRoles.length ? scopeOf(structureProfile, 'structure.read') : [];
  const sections: FixtureStudent[] =
    profile.school === 'B'
      ? []
      : structureScope === null
        ? ['X', 'Y']
        : (['X', 'Y'] as const).filter((s) => structureScope.includes(STUDENT_STAGE[s]!));

  const usersRead = has('users.read');
  const studentWrite = has('students.write')
    ? scopeOf(profile, 'students.write') === null
      ? 'allowed'
      : 'refused' // stage-scoped writers cannot insert a bare student (R7)
    : 'refused';

  const directory: Expectation = !has('students.read')
    ? { read: 'refused' }
    : {
        read: has('finance.read') ? 'all' : 'masked',
        rowsOf: students,
      };

  const kpis: Expectation = has('finance.read')
    ? { read: 'all' }
    : has('finance.totals')
      ? { read: 'totals' }
      : { read: 'refused' };

  const portalSummary: Expectation = has('finance.read')
    ? { read: 'all' }
    : has('portal.linked') && (PORTAL_LINKS[user]?.length ?? 0) > 0
      ? { read: 'scoped', rowsOf: [...(PORTAL_LINKS[user] ?? [])] }
      : { read: 'refused' };

  const moneyWrite: Expectation = {
    read: 'none',
    write: has('finance.write') ? 'allowed' : 'refused',
  };

  // The fixture seeds notifications for School A users only.
  const notificationTypes =
    profile.school === 'A'
      ? has('finance.read')
        ? [...ALL_NOTIFICATION_TYPES]
        : ['subscription_expiring']
      : [];

  const out: Record<string, Expectation> = {
    school: isSuper
      ? { read: 'all', write: 'allowed' }
      : {
          read: has('school.profile_read') ? 'own' : 'none',
          write: has('settings.manage') ? 'allowed' : 'refused',
        },
    subscription: isSuper
      ? { read: 'all', write: 'allowed' }
      : { read: has('school.profile_read') ? 'all' : 'none', write: 'refused' },
    academic_year: {
      read: structureRoles.length > 0 ? 'all' : 'none',
      write: has('structure.write') ? 'allowed' : 'refused',
    },
    section: {
      ...(profile.school === 'B'
        ? { read: 'all' as const }
        : sections.length === 0
          ? { read: 'none' as const }
          : structureScope === null
            ? { read: 'all' as const }
            : { read: 'scoped' as const, rowsOf: sections }),
      write: has('structure.write') ? 'allowed' : 'refused',
    },
    student: { ...studentScoped(students), write: studentWrite },
    enrollment: studentScoped(enrolled),
    account: finConfig,
    fee_structure: finConfig,
    fee_item: finConfig,
    installment_schedule: finConfig,
    reminder_rule: finConfig,
    installment: finLedger,
    money_event: finLedger,
    payment_allocation: finLedger,
    receipt_counter: finLedger,
    discount: finLedger,
    audit_entry: finLedger,
    sms_message_log: finLedger,
    sms_credit_topup: isSuper ? { read: 'all' } : finLedger,
    sms_credit_consumption: finLedger,
    notification: inSchool ? { read: 'own', types: notificationTypes } : { read: 'none' },
    user: isSuper ? { read: 'all' } : { read: usersRead ? 'all' : 'own' },
    role_assignment: isSuper ? { read: 'none' } : { read: usersRead ? 'all' : 'own' },
    role_assignment_stage:
      isSuper || !inSchool ? { read: 'none' } : { read: usersRead ? 'all' : 'own' },
    portal_link: isSuper ? { read: 'none' } : { read: usersRead ? 'all' : 'own' },
    school_role_permission: { read: usersRead ? 'all' : 'none' },
    stage: { read: 'all' },
    grade: { read: 'all' },
    'storage:money-attachments': {
      read: has('finance.read') ? 'all' : 'none',
      write: has('finance.write') ? 'allowed' : 'refused',
    },
    'storage:school-logos': { read: 'all', write: has('settings.manage') ? 'allowed' : 'refused' },

    student_statement: finFn,
    student_payments: finFn,
    receivables_aging: finFn,
    account_balance: finFn,
    installment_running_balance: finFn,
    student_balance: finFn,
    student_financial_summary: portalSummary,
    student_installments: portalSummary,
    dashboard_kpis: kpis,
    student_directory: directory,
    sms_credit_balance: finFn,

    apply_fee_payment: moneyWrite,
    record_expense: moneyWrite,
    record_transfer: moneyWrite,
    record_refund: moneyWrite,
    record_adjustment: moneyWrite,
    apply_discount: moneyWrite,
    reverse_event: moneyWrite,
    record_opening_balance: moneyWrite,
    topup_sms_credit: { read: 'none', write: isSuper ? 'allowed' : 'refused' },
    consume_sms_credit: { read: 'refused' },
    check_low_sms_credit: { read: 'refused' },
    generate_installments: { read: 'refused' },
  };
  return out as Record<DataSetOrFn, Expectation>;
}

export const ACCESS_EXPECTATIONS: Readonly<Record<FixtureUser, Record<DataSetOrFn, Expectation>>> =
  Object.fromEntries(FIXTURE_USERS.map((u) => [u, expectationsFor(u)])) as Record<
    FixtureUser,
    Record<DataSetOrFn, Expectation>
  >;
