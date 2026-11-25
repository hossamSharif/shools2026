import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client for integration tests (Article X). Bypasses RLS so tests
 * can arrange tenant data across schools. Reads SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY from the environment; skips gracefully when unset.
 */
export function getServiceClient(): SupabaseClient | null {
  const url = getUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getAnonKey(): string | undefined {
  return process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export const INTEGRATION_ENV_READY = Boolean(
  getUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY && getAnonKey(),
);

export type UserRole = 'super_admin' | 'school_admin' | 'accountant' | 'viewer';

export interface AuthedUser {
  userId: string;
  email: string;
  /** RLS-bound client authenticated AS this user (JWT carries auth.uid()). */
  client: SupabaseClient;
  cleanup: () => Promise<void>;
}

/**
 * Provisions a confirmed Auth user, inserts the matching public.user row with
 * the given role/school, and returns a client signed in as that user so RLS +
 * auth.uid()-based checks (e.g. current_is_super_admin) evaluate correctly.
 */
export async function createAuthedUser(
  service: SupabaseClient,
  role: UserRole,
  schoolId: string | null,
  displayName = 'Test User',
): Promise<AuthedUser> {
  const email = `t-${role}-${Date.now()}-${Math.round(performance.now())}@example.test`;
  const password = 'Test-Passw0rd!';

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error('createUser failed');
  const userId = created.user.id;

  const { error: profileErr } = await service.from('user').insert({
    id: userId,
    role,
    school_id: schoolId,
    display_name: displayName,
  });
  if (profileErr) throw profileErr;

  const client = createClient(getUrl()!, getAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return {
    userId,
    email,
    client,
    cleanup: async () => {
      await service.from('user').delete().eq('id', userId);
      await service.auth.admin.deleteUser(userId);
    },
  };
}

// ---------------------------------------------------------------------------
// Feature 002 helpers (role-aware access). `createAuthedUser` and `UserRole`
// above stay unchanged for the Phase 1 suites (FR-036).
// ---------------------------------------------------------------------------

/** Every `user_role` value after migration 0033. */
export type AccessRole =
  | 'super_admin'
  | 'school_admin'
  | 'principal'
  | 'student_affairs'
  | 'teacher'
  | 'accountant'
  | 'viewer'
  | 'guardian'
  | 'student';

/** Primary-role precedence (mirrors @erp/shared/access ROLE_PRECEDENCE). */
const ACCESS_ROLE_PRECEDENCE: readonly AccessRole[] = [
  'super_admin',
  'school_admin',
  'principal',
  'accountant',
  'student_affairs',
  'teacher',
  'viewer',
  'guardian',
  'student',
];

export interface CreateAuthedStaffOptions {
  roles: AccessRole[];
  schoolId: string | null;
  /** Stage ids per stage-scopable role. Omitted = school-wide (FR-018a). */
  stages?: Partial<Record<'principal' | 'student_affairs', string[]>>;
  displayName?: string;
  status?: 'active' | 'deactivated';
}

let staffSeq = 0;

/**
 * Provisions a confirmed Auth user with one or more roles: inserts
 * `public.user` with the primary role (the `user_sync_primary_assignment`
 * trigger creates its assignment), adds the other `role_assignment` rows and
 * any `role_assignment_stage` rows with the service client, then signs in with
 * the anon key so every query runs under the user's own session.
 */
export async function createAuthedStaff(
  service: SupabaseClient,
  opts: CreateAuthedStaffOptions,
): Promise<AuthedUser> {
  const roles = [...new Set(opts.roles)];
  if (roles.length === 0) throw new Error('createAuthedStaff: roles must not be empty');
  const primary = ACCESS_ROLE_PRECEDENCE.find((r) => roles.includes(r))!;

  staffSeq += 1;
  const email = `t-${primary}-${Date.now()}-${process.pid}-${staffSeq}-${Math.round(Math.random() * 1e6)}@example.test`;
  const password = 'Test-Passw0rd!';

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error('createUser failed');
  const userId = created.user.id;

  const { error: profileErr } = await service.from('user').insert({
    id: userId,
    role: primary,
    school_id: opts.schoolId,
    display_name: opts.displayName ?? `Test ${roles.join('+')}`,
    status: opts.status ?? 'active',
  });
  if (profileErr) throw profileErr;

  if (primary !== 'super_admin') {
    const extra = roles.filter((r) => r !== primary);
    if (extra.length > 0) {
      const { error } = await service
        .from('role_assignment')
        .insert(extra.map((role) => ({ user_id: userId, school_id: opts.schoolId, role })));
      if (error) throw error;
    }

    const stageRows: { assignment_id: string; stage_id: string; school_id: string }[] = [];
    const stageEntries = Object.entries(opts.stages ?? {}) as [string, string[] | undefined][];
    if (stageEntries.some(([, ids]) => ids && ids.length > 0)) {
      const { data: assignments, error } = await service
        .from('role_assignment')
        .select('id, role')
        .eq('user_id', userId);
      if (error) throw error;
      for (const [role, ids] of stageEntries) {
        const a = (assignments ?? []).find((x) => x.role === role);
        if (!a) throw new Error(`createAuthedStaff: stages given for unassigned role ${role}`);
        for (const stageId of ids ?? []) {
          stageRows.push({
            assignment_id: a.id as string,
            stage_id: stageId,
            school_id: opts.schoolId!,
          });
        }
      }
    }
    if (stageRows.length > 0) {
      const { error } = await service.from('role_assignment_stage').insert(stageRows);
      if (error) throw error;
    }
  }

  const client = createClient(getUrl()!, getAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return {
    userId,
    email,
    client,
    cleanup: async () => {
      // service_role is exempt from user_guard_direct_changes (data-model §2).
      await service.from('user').delete().eq('id', userId);
      await service.auth.admin.deleteUser(userId);
    },
  };
}

/** Links a portal user to a student (service role only; no write grant, FR-017). */
export async function linkPortal(
  service: SupabaseClient,
  link: { userId: string; studentId: string; schoolId: string; kind: 'guardian' | 'self' },
): Promise<string> {
  const { data, error } = await service
    .from('portal_link')
    .insert({
      user_id: link.userId,
      student_id: link.studentId,
      school_id: link.schoolId,
      kind: link.kind,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

const khartoumDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Khartoum',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function khartoumDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return khartoumDate.format(d);
}

/**
 * Moves a school's subscription into the given lifecycle state by setting
 * `period_end` relative to today in Africa/Khartoum (grace_days = 14):
 * active = ends in a year, grace = ended yesterday, locked = ended 30 days ago.
 */
export async function setSubscriptionState(
  service: SupabaseClient,
  schoolId: string,
  state: 'active' | 'grace' | 'locked',
): Promise<void> {
  const endOffset = state === 'active' ? 365 : state === 'grace' ? -1 : -30;
  const row = {
    period_start: khartoumDatePlus(endOffset - 365),
    period_end: khartoumDatePlus(endOffset),
    grace_days: 14,
  };
  const { data: existing, error: readErr } = await service
    .from('subscription')
    .select('id')
    .eq('school_id', schoolId);
  if (readErr) throw readErr;
  if (existing && existing.length > 0) {
    const { error } = await service.from('subscription').update(row).eq('school_id', schoolId);
    if (error) throw error;
  } else {
    const { error } = await service.from('subscription').insert({ school_id: schoolId, ...row });
    if (error) throw error;
  }
}
