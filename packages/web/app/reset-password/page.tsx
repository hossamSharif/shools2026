import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase/server.js';
import { ResetPasswordForm } from '../../components/auth/reset-password-form.js';

/**
 * Set-new-password page, reached from the recovery link via /auth/confirm which
 * establishes a session. Without a session (link expired / opened directly) we
 * bounce to /login. This is not in middleware's public list on purpose — a valid
 * recovery session is required to be here.
 */
export default async function ResetPasswordPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">تعيين كلمة مرور جديدة</h1>
      <ResetPasswordForm />
    </main>
  );
}
