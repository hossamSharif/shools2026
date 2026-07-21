import { ForgotPasswordForm } from '../../components/auth/forgot-password-form.js';

/** Public forgot-password page (middleware.ts allow-lists /forgot-password). */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">إعادة تعيين كلمة المرور</h1>
      <ForgotPasswordForm />
    </main>
  );
}
