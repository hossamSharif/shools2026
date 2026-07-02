import { requireRole } from '../../lib/auth/guard.js';
import { AppShell } from '../../components/app-shell.js';

/** School operator surface (US2–US4). Tenant-scoped by RLS + role guard. */
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole('school_admin', 'accountant', 'viewer');
  return (
    <AppShell role={ctx.role} displayName={ctx.displayName} schoolId={ctx.schoolId}>
      {children}
    </AppShell>
  );
}
