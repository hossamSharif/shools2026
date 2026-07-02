import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { UserRole } from '../lib/auth/guard.js';
import { LifecycleBanner } from './lifecycle-banner.js';
import { getLifecycleInfo, writesAllowed } from '../lib/auth/lifecycle-gate.js';
import { NotificationBell } from './notifications/bell.js';

interface NavItem {
  href: string;
  key: string;
  roles: UserRole[];
  /** Mutate surfaces (T128, US8): hidden outside the active lifecycle state. */
  mutate?: boolean;
}

// Role-scoped navigation. Super-admin sees only the operator surface (schools);
// school roles see the tenant app (Article IV separation).
const NAV: NavItem[] = [
  { href: '/schools', key: 'schools', roles: ['super_admin'] },
  { href: '/dashboard', key: 'dashboard', roles: ['school_admin', 'accountant', 'viewer'] },
  { href: '/students', key: 'students', roles: ['school_admin', 'accountant', 'viewer'] },
  { href: '/payments/new', key: 'payments', roles: ['school_admin', 'accountant'], mutate: true },
  { href: '/expenses/new', key: 'expenses', roles: ['school_admin', 'accountant'], mutate: true },
  { href: '/reports/receivables', key: 'reports', roles: ['school_admin', 'accountant', 'viewer'] },
  { href: '/sms', key: 'sms', roles: ['school_admin', 'accountant', 'viewer'] },
  { href: '/notifications', key: 'notifications', roles: ['school_admin', 'accountant', 'viewer'] },
  { href: '/settings/years', key: 'settings', roles: ['school_admin'] },
];

/**
 * RTL app shell with role-scoped nav. Server component (reads translations).
 * T128/T129 (US8): resolves the derived lifecycle state once, hides mutate nav
 * entries outside 'active', and pins the countdown banner. This is a UI
 * affordance only — every mutate RPC re-enforces write-gating server-side
 * regardless (Article IV — the DB is the sole authority).
 */
export async function AppShell({
  role,
  displayName,
  schoolId = null,
  children,
}: {
  role: UserRole;
  displayName: string;
  schoolId?: string | null;
  children: React.ReactNode;
}) {
  const t = await getTranslations('app');
  const { state } = await getLifecycleInfo(schoolId);
  const allowMutate = writesAllowed(state);

  const items = NAV.filter((i) => i.roles.includes(role) && (allowMutate || !i.mutate));

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {schoolId && <LifecycleBanner schoolId={schoolId} />}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <span className="text-lg font-bold">{t('title')}</span>
        <div className="flex items-center gap-4">
          {schoolId && <NotificationBell />}
          <span className="text-sm text-gray-500">{displayName}</span>
        </div>
      </header>
      <div className="flex">
        <nav className="w-56 shrink-0 border-e bg-white p-4">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
