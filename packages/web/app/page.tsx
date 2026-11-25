import { redirect } from 'next/navigation';
import { requireAuth } from '../lib/auth/guard.js';

/**
 * Root: sends an authenticated user to their landing screen
 * (contracts/web-routes.md): super-admin → /schools; finance.totals holders
 * (school_admin, accountant, viewer, principal) → /dashboard; other staff →
 * /home. For Phase 1 roles the result is unchanged.
 */
export default async function HomePage() {
  const ctx = await requireAuth();
  if (ctx.isSuperAdmin) redirect('/schools');
  redirect(ctx.permissions.has('finance.totals') ? '/dashboard' : '/home');
}
