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
