/**
 * Permission vocabulary for role-aware access control (feature 002).
 *
 * Single source of truth for TypeScript callers: screen guards, the matrix
 * tests and the catalogue test (which asserts the database seed in migration
 * 0035 equals this file). The database is the authority at run time; this file
 * mirrors contracts/access-matrix.md §1–§2 so tests can compare both.
 */

/** Every value of the Postgres `user_role` enum (after migration 0033). */
export const ROLES = [
  'super_admin',
  'school_admin',
  'principal',
  'student_affairs',
  'teacher',
  'accountant',
  'viewer',
  'guardian',
  'student',
] as const;
export type Role = (typeof ROLES)[number];

/** Staff roles: may sign in to the school app (FR-029). */
export const STAFF_ROLES = [
  'school_admin',
  'principal',
  'student_affairs',
  'teacher',
  'accountant',
  'viewer',
] as const satisfies readonly Role[];
/** Zod schema + exported type live in schemas/access.ts (`StaffRole`). */
type StaffRole = (typeof STAFF_ROLES)[number];

/** Portal roles: reserved in this feature, refused by the staff login. */
export const PORTAL_ROLES = ['guardian', 'student'] as const satisfies readonly Role[];
export type PortalRole = (typeof PORTAL_ROLES)[number];

/** Roles that may carry a stage scope (FR-018a). */
export const STAGE_SCOPABLE_ROLES = [
  'principal',
  'student_affairs',
] as const satisfies readonly StaffRole[];
export type StageScopableRole = (typeof STAGE_SCOPABLE_ROLES)[number];

/**
 * Primary-role precedence (highest first). `user.role` is recomputed from the
 * assignments with this order (data-model §3). super_admin is never assigned.
 */
export const ROLE_PRECEDENCE = [
  'school_admin',
  'principal',
  'accountant',
  'student_affairs',
  'teacher',
  'viewer',
  'guardian',
  'student',
] as const satisfies readonly Role[];

/** Pick the primary role of a role set by precedence. */
export function primaryRole(roles: readonly Role[]): Role | null {
  if (roles.includes('super_admin')) return 'super_admin';
  for (const r of ROLE_PRECEDENCE) if (roles.includes(r)) return r;
  return null;
}

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function isPortalRole(role: string): role is PortalRole {
  return (PORTAL_ROLES as readonly string[]).includes(role);
}

// ---------------------------------------------------------------------------
// Permission keys
// ---------------------------------------------------------------------------

export type PermissionModule =
  | 'school'
  | 'finance'
  | 'sms'
  | 'students'
  | 'structure'
  | 'users'
  | 'settings'
  | 'portal'
  | 'academics'
  | 'attendance'
  | 'homework'
  | 'exams'
  | 'announcements'
  | 'cms';

export interface PermissionDef {
  readonly key: string;
  readonly module: PermissionModule;
  readonly action: string;
  /** Narrowed by stage scope for principal/student_affairs (research R7). */
  readonly stageScopable: boolean;
  /** false = defined now, enforced when the module ships (access-matrix §2). */
  readonly enforced: boolean;
  readonly labelAr: string;
}

const p = <K extends string>(
  key: K,
  module: PermissionModule,
  action: string,
  stageScopable: boolean,
  enforced: boolean,
  labelAr: string,
) => ({ key, module, action, stageScopable, enforced, labelAr }) as const;

/** Every key of access-matrix §1 (enforced) and §2 (not yet enforced). */
export const PERMISSION_KEYS = [
  // §1 — enforced in this feature
  p('school.profile_read', 'school', 'view', false, true, 'عرض بيانات المدرسة'),
  p('finance.read', 'finance', 'view', false, true, 'عرض البيانات المالية'),
  p('finance.totals', 'finance', 'totals', false, true, 'عرض الإجماليات المالية'),
  p('finance.write', 'finance', 'edit', false, true, 'تسجيل العمليات المالية'),
  p('finance.export', 'finance', 'export', false, true, 'تصدير التقارير المالية'),
  p('sms.send_manual', 'sms', 'send', true, true, 'إرسال رسائل SMS يدوية'),
  p('students.read', 'students', 'view', true, true, 'عرض بيانات الطلاب'),
  p('students.read_limited', 'students', 'view_limited', true, true, 'عرض بيانات طلاب الفصول المسندة'),
  p('students.guardian_contact', 'students', 'view_guardian', true, true, 'عرض بيانات ولي الأمر'),
  p('students.fee_indicator', 'students', 'view_fee_indicator', true, true, 'عرض مؤشر حالة الرسوم'),
  p('students.write', 'students', 'edit', true, true, 'تسجيل الطلاب وتعديل بياناتهم'),
  p('students.delete', 'students', 'delete', true, true, 'حذف الطلاب'),
  p('students.export', 'students', 'export', true, true, 'تصدير بيانات الطلاب'),
  p('structure.read', 'structure', 'view', true, true, 'عرض السنوات الدراسية والفصول'),
  p('structure.write', 'structure', 'edit', false, true, 'تعديل السنوات الدراسية والفصول'),
  p('users.read', 'users', 'view', false, true, 'عرض المستخدمين وسجل الصلاحيات'),
  p('users.manage', 'users', 'manage', false, true, 'إدارة المستخدمين والصلاحيات'),
  p('settings.read', 'settings', 'view', false, true, 'عرض الإعدادات'),
  p('settings.manage', 'settings', 'manage', false, true, 'تعديل الإعدادات'),
  p('portal.linked', 'portal', 'view_linked', false, true, 'عرض بيانات الأبناء المرتبطين'),
  p('portal.self', 'portal', 'view_self', false, true, 'عرض البيانات الشخصية'),

  // §2 — defined now, enforced when the module ships
  p('academics.view', 'academics', 'view', true, false, 'الشؤون الأكاديمية: عرض'),
  p('academics.create', 'academics', 'create', true, false, 'الشؤون الأكاديمية: إضافة'),
  p('academics.edit', 'academics', 'edit', true, false, 'الشؤون الأكاديمية: تعديل'),
  p('academics.approve', 'academics', 'approve', true, false, 'الشؤون الأكاديمية: اعتماد'),
  p('attendance.view', 'attendance', 'view', true, false, 'الحضور: عرض'),
  p('attendance.create', 'attendance', 'create', true, false, 'الحضور: تسجيل'),
  p('attendance.edit', 'attendance', 'edit', true, false, 'الحضور: تعديل'),
  p('attendance.approve', 'attendance', 'approve', true, false, 'الحضور: اعتماد'),
  p('homework.view', 'homework', 'view', true, false, 'الواجبات: عرض'),
  p('homework.create', 'homework', 'create', true, false, 'الواجبات: إضافة'),
  p('homework.edit', 'homework', 'edit', true, false, 'الواجبات: تعديل'),
  p('homework.publish', 'homework', 'publish', true, false, 'الواجبات: نشر'),
  p('exams.view', 'exams', 'view', true, false, 'الاختبارات والنتائج: عرض'),
  p('exams.create', 'exams', 'create', true, false, 'الاختبارات والنتائج: إضافة'),
  p('exams.edit', 'exams', 'edit', true, false, 'الاختبارات والنتائج: تعديل الدرجات'),
  p('exams.approve', 'exams', 'approve', true, false, 'الاختبارات والنتائج: اعتماد'),
  p('exams.publish', 'exams', 'publish', true, false, 'الاختبارات والنتائج: نشر'),
  p('announcements.view', 'announcements', 'view', true, false, 'الإعلانات: عرض'),
  p('announcements.create', 'announcements', 'create', true, false, 'الإعلانات: إضافة'),
  p('announcements.edit', 'announcements', 'edit', true, false, 'الإعلانات: تعديل'),
  p('announcements.approve', 'announcements', 'approve', true, false, 'الإعلانات: اعتماد'),
  p('announcements.publish', 'announcements', 'publish', true, false, 'الإعلانات: نشر'),
  p('announcements.publish_own', 'announcements', 'publish_own', true, false, 'الإعلانات: نشر إعلاناته الخاصة'),
  p('cms.view', 'cms', 'view', false, false, 'موقع المدرسة: عرض'),
  p('cms.create', 'cms', 'create', false, false, 'موقع المدرسة: إضافة'),
  p('cms.edit', 'cms', 'edit', false, false, 'موقع المدرسة: تعديل'),
  p('cms.approve', 'cms', 'approve', false, false, 'موقع المدرسة: اعتماد'),
  p('cms.publish', 'cms', 'publish', false, false, 'موقع المدرسة: نشر'),
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number]['key'];

export const PERMISSION_BY_KEY: ReadonlyMap<PermissionKey, PermissionDef> = new Map(
  PERMISSION_KEYS.map((d) => [d.key, d]),
);

export function isPermissionKey(key: string): key is PermissionKey {
  return PERMISSION_BY_KEY.has(key as PermissionKey);
}

// ---------------------------------------------------------------------------
// Defaults (the D cells of access-matrix §1 and the §2 defaults)
// ---------------------------------------------------------------------------

const ACADEMICS_ALL = ['academics.view', 'academics.create', 'academics.edit', 'academics.approve'] as const;
const ATTENDANCE_ALL = ['attendance.view', 'attendance.create', 'attendance.edit', 'attendance.approve'] as const;
const HOMEWORK_ALL = ['homework.view', 'homework.create', 'homework.edit', 'homework.publish'] as const;
const EXAMS_ALL = ['exams.view', 'exams.create', 'exams.edit', 'exams.approve', 'exams.publish'] as const;
const ANNOUNCEMENTS_ALL = [
  'announcements.view',
  'announcements.create',
  'announcements.edit',
  'announcements.approve',
  'announcements.publish',
  'announcements.publish_own',
] as const;
const CMS_ALL = ['cms.view', 'cms.create', 'cms.edit', 'cms.approve', 'cms.publish'] as const;

/**
 * Default grants per role. Seeded into `role_permission_default` (0035).
 * super_admin holds no key (FR-024).
 */
export const ROLE_DEFAULTS: Readonly<Record<Role, readonly PermissionKey[]>> = {
  super_admin: [],
  school_admin: [
    'school.profile_read',
    'finance.read',
    'finance.totals',
    'finance.write',
    'finance.export',
    'sms.send_manual',
    'students.read',
    'students.write',
    'students.delete',
    'students.export',
    'structure.read',
    'structure.write',
    'users.read',
    'users.manage',
    'settings.read',
    'settings.manage',
    ...ACADEMICS_ALL,
    ...ATTENDANCE_ALL,
    ...HOMEWORK_ALL,
    ...EXAMS_ALL,
    ...ANNOUNCEMENTS_ALL,
    ...CMS_ALL,
  ],
  principal: [
    'school.profile_read',
    'finance.totals',
    'students.read',
    'students.export',
    'structure.read',
    'users.read',
    'settings.read',
    ...ACADEMICS_ALL,
    'attendance.view',
    'attendance.approve',
    'homework.view',
    'exams.view',
    'exams.approve',
    'exams.publish',
    ...ANNOUNCEMENTS_ALL,
    ...CMS_ALL,
  ],
  student_affairs: [
    'school.profile_read',
    'students.read',
    'students.write',
    'students.export',
    'structure.read',
    'academics.view',
    'attendance.view',
    'attendance.create',
    'attendance.edit',
    'homework.view',
    'exams.view',
    'announcements.view',
    'announcements.create',
    'announcements.edit',
    'cms.view',
    'cms.create',
    'cms.edit',
  ],
  teacher: [
    'school.profile_read',
    'students.read_limited',
    'structure.read',
    'academics.view',
    'attendance.view',
    'attendance.create',
    'attendance.edit',
    'homework.view',
    'homework.create',
    'homework.edit',
    'homework.publish',
    'exams.view',
    'exams.create',
    'exams.edit',
    'announcements.view',
    'announcements.create',
  ],
  accountant: [
    'school.profile_read',
    'finance.read',
    'finance.totals',
    'finance.write',
    'finance.export',
    'sms.send_manual',
    'students.read',
    'students.write',
    'students.export',
    'structure.read',
    'structure.write',
    'announcements.view',
  ],
  viewer: [
    'school.profile_read',
    'finance.read',
    'finance.totals',
    'students.read',
    'students.export',
    'structure.read',
    'announcements.view',
  ],
  guardian: [
    'school.profile_read',
    'portal.linked',
    'academics.view',
    'attendance.view',
    'homework.view',
    'exams.view',
    'announcements.view',
  ],
  student: [
    'school.profile_read',
    'portal.self',
    'academics.view',
    'attendance.view',
    'homework.view',
    'exams.view',
    'announcements.view',
  ],
};

// ---------------------------------------------------------------------------
// Optional switches (FR-010). No principal finance switch (constitution XIV, R15).
// ---------------------------------------------------------------------------

export interface OptionalPermissionDef {
  readonly role: StaffRole;
  readonly key: PermissionKey;
  readonly defaultEnabled: boolean;
  readonly labelAr: string;
}

export const OPTIONAL_PERMISSIONS = [
  { role: 'teacher', key: 'students.guardian_contact', defaultEnabled: false, labelAr: 'عرض بيانات ولي الأمر' },
  { role: 'teacher', key: 'announcements.publish_own', defaultEnabled: false, labelAr: 'نشر إعلاناته الخاصة' },
  { role: 'student_affairs', key: 'students.fee_indicator', defaultEnabled: false, labelAr: 'عرض مؤشر حالة الرسوم' },
  { role: 'student_affairs', key: 'sms.send_manual', defaultEnabled: false, labelAr: 'إرسال رسائل SMS يدوية' },
  { role: 'principal', key: 'structure.write', defaultEnabled: false, labelAr: 'تعديل السنوات الدراسية والفصول' },
  { role: 'viewer', key: 'finance.export', defaultEnabled: true, labelAr: 'تصدير التقارير المالية' },
] as const satisfies readonly OptionalPermissionDef[];

/** Zod schema + exported type live in schemas/access.ts (`OptionalPermissionKey`). */
export const OPTIONAL_PERMISSION_KEYS = [
  'students.guardian_contact',
  'announcements.publish_own',
  'students.fee_indicator',
  'sms.send_manual',
  'structure.write',
  'finance.export',
] as const satisfies readonly (typeof OPTIONAL_PERMISSIONS)[number]['key'][];

/** Roles that have at least one optional switch. */
export const OPTIONAL_PERMISSION_ROLES = [
  'teacher',
  'student_affairs',
  'principal',
  'viewer',
] as const satisfies readonly (typeof OPTIONAL_PERMISSIONS)[number]['role'][];

// ---------------------------------------------------------------------------
// Never-grantable (FR-011): the ✗ cells of access-matrix §1.
// ---------------------------------------------------------------------------

export const NEVER_GRANTABLE: Readonly<Record<Role, readonly PermissionKey[]>> = {
  super_admin: [],
  school_admin: [],
  principal: ['finance.read', 'finance.write', 'users.manage', 'settings.manage'],
  student_affairs: [
    'finance.read',
    'finance.write',
    'finance.export',
    'users.manage',
    'settings.manage',
  ],
  teacher: [
    'finance.read',
    'finance.totals',
    'finance.write',
    'finance.export',
    'students.fee_indicator',
    'students.write',
    'students.delete',
    'structure.write',
    'users.manage',
    'settings.manage',
  ],
  accountant: ['users.manage', 'settings.manage'],
  viewer: ['finance.write', 'users.manage', 'settings.manage'],
  guardian: [
    'finance.read',
    'finance.totals',
    'finance.write',
    'finance.export',
    'sms.send_manual',
    'students.fee_indicator',
    'students.write',
    'students.delete',
    'students.export',
    'structure.write',
    'users.read',
    'users.manage',
    'settings.read',
    'settings.manage',
    'portal.self',
  ],
  student: [
    'finance.read',
    'finance.totals',
    'finance.write',
    'finance.export',
    'sms.send_manual',
    'students.fee_indicator',
    'students.write',
    'students.delete',
    'students.export',
    'structure.write',
    'users.read',
    'users.manage',
    'settings.read',
    'settings.manage',
    'portal.linked',
  ],
};
