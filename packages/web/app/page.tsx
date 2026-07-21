import { redirect } from 'next/navigation';
import { requireAuth } from '../lib/auth/guard.js';

/** Root: sends an authenticated user to their role's home screen. */
export default async function HomePage() {
  const ctx = await requireAuth();
  redirect(ctx.role === 'super_admin' ? '/schools' : '/dashboard');
}
