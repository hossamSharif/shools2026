import { redirect } from 'next/navigation';
import { MyAccess } from '@erp/shared/schemas';
import { createSupabaseServerClient } from '../supabase/server.js';

/**
 * Server-side guards (contracts/web-routes.md). Screens are defense in depth
 * only (FR-019): every guard mirrors a database check that refuses on its own.
 * The caller's roles, permissions and scope come from `rpc('my_access')` on
 * every request, so a revocation applies on the next navigation (FR-028).
 */

export type UserRole =
  | 'super_admin'
  | 'school_admin'
  | 'principal'
  | 'student_affairs'
  | 'teacher'
  | 'accountant'
  | 'viewer'
  | 'guardian'
  | 'student';

export interface AuthContext {
  userId: string;
  /** Primary role (compat; display only, never for authorization). */
  role: UserRole;
  roles: UserRole[];
  permissions: ReadonlySet<string>;
  /** Permission key → null (school-wide) or stage ids. */
  stageScope: Record<string, string[] | null>;
  schoolId: string | null;
  displayName: string;
  isStaff: boolean;
  isSuperAdmin: boolean;
  status: 'invited' | 'active' | 'deactivated';
}

interface UserProfileRow {
  role: UserRole;
  display_name: string;
}

/**
 * Resolves the session user and their access context from the database (the
 * resolution authority, Article IV). Redirects to /login without a session or
 * a profile. Never trusts a client-supplied school, role or permission.
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: accessRaw, error: accessErr }] = await Promise.all([
    supabase.from('user').select('role, display_name').eq('id', user.id).single<UserProfileRow>(),
    supabase.rpc('my_access'),
  ]);
  if (!profile || accessErr) redirect('/login');

  const access = MyAccess.parse(accessRaw);

  return {
    userId: user.id,
    role: profile.role,
    roles: access.roles as UserRole[],
    permissions: new Set(access.permissions),
    stageScope: access.stage_scope,
    schoolId: access.school_id,
    displayName: profile.display_name,
    isStaff: access.is_staff,
    isSuperAdmin: access.is_super_admin,
    status: access.status,
  };
}

/**
 * Compat guard: the caller holds ANY of the roles, else redirect to `/`.
 * Prefer `requirePermission`; roles are not authorization (research R2).
 */
export async function requireRole(...allowed: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.roles.some((r) => allowed.includes(r))) {
    redirect('/');
  }
  return ctx;
}

/**
 * Staff-only gate for the school app (FR-029). A deactivated user, or one
 * with no school, is sent to /login?e=inactive; a portal-only user (guardian /
 * student) to /login?e=portal. Both are signed out first. The sign-out revokes
 * the session server-side; in a Server Component the cookie itself cannot be
 * cleared, and the middleware then finds no valid session.
 */
export async function requireStaff(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.isSuperAdmin) return ctx;

  let reason: 'inactive' | 'portal' | null = null;
  if (ctx.status !== 'active' || !ctx.schoolId) reason = 'inactive';
  else if (!ctx.isStaff) reason = 'portal';

  if (reason) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect(`/login?e=${reason}`);
  }
  return ctx;
}

/** The caller holds ANY of the permission keys, else redirect to /forbidden. */
export async function requirePermission(...keys: string[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!keys.some((k) => ctx.permissions.has(k))) {
    redirect('/forbidden');
  }
  return ctx;
}

/** Non-redirecting check for route handlers, which answer 403 instead (T041). */
export function hasPermission(ctx: AuthContext, ...keys: string[]): boolean {
  return keys.some((k) => ctx.permissions.has(k));
}
