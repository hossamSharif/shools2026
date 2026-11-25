import { requireRole } from '../../lib/auth/guard.js';
import { AppShell } from '../../components/app-shell.js';

/** Super-admin operator surface. Walled off from any school's financials. */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole('super_admin');
  return (
    <AppShell
      access={{
        permissions: ctx.permissions,
        isSuperAdmin: ctx.isSuperAdmin,
        isStaff: ctx.isStaff,
      }}
      displayName={ctx.displayName}
    >
      {children}
    </AppShell>
  );
}
