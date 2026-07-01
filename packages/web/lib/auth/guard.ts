import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../supabase/server.js';

export type UserRole = 'super_admin' | 'school_admin' | 'accountant' | 'viewer';

interface UserProfileRow {
  role: UserRole;
  school_id: string | null;
  display_name: string;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  schoolId: string | null;
  displayName: string;
}

/**
 * Resolves the current session user + their role/school from the `user` table
 * (the DB resolution authority — Article IV). Redirects to /login when there is
 * no authenticated session. Never trusts a client-supplied school/role.
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('user')
    .select('role, school_id, display_name')
    .eq('id', user.id)
    .single<UserProfileRow>();

  if (!profile) {
    redirect('/login');
  }

  return {
    userId: user.id,
    role: profile.role,
    schoolId: profile.school_id,
    displayName: profile.display_name,
  };
}

/** Enforce a role allow-list; redirects to the app root when not permitted. */
export async function requireRole(...allowed: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!allowed.includes(ctx.role)) {
    redirect('/');
  }
  return ctx;
}
