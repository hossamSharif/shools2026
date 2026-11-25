import { requireStaff } from '../../lib/auth/guard.js';
import { AppShell } from '../../components/app-shell.js';

/** School operator surface. Staff only (FR-029); RLS + permission guards decide. */
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  return (
    <AppShell
      access={{
        permissions: ctx.permissions,
        isSuperAdmin: ctx.isSuperAdmin,
        isStaff: ctx.isStaff,
      }}
      displayName={ctx.displayName}
      schoolId={ctx.schoolId}
    >
      {children}
    </AppShell>
  );
}
