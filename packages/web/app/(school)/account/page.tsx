import { requireAuth } from '../../../lib/auth/guard.js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { ProfileForm } from '../../../components/account/profile-form.js';

/**
 * Self-service account management (own profile). Reachable by every school role
 * via the header account menu. Email lives in auth.users (not public.user), so
 * read it from the session; display_name comes from the resolved AuthContext.
 */
export default async function AccountPage() {
  const ctx = await requireAuth();
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">حسابي</h1>
      <ProfileForm displayName={ctx.displayName} email={user?.email ?? ''} />
    </div>
  );
}
