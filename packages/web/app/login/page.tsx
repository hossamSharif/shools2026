import { LoginForm } from '../../components/auth/login-form.js';

/**
 * Public sign-in page (middleware.ts allow-lists /login). `?e=inactive` or
 * `?e=portal` is set by requireStaff() when it signs a refused user out.
 */
export default function LoginPage({ searchParams }: { searchParams: { e?: string } }) {
  const notice =
    searchParams.e === 'inactive' || searchParams.e === 'portal' ? searchParams.e : null;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">نظام محاسبة الرسوم المدرسية</h1>
      <LoginForm notice={notice} />
    </main>
  );
}
