import { getTranslations } from 'next-intl/server';
import type { UserRole } from '../lib/auth/guard.js';
import { LifecycleBanner } from './lifecycle-banner.js';
import { getLifecycleInfo, writesAllowed } from '../lib/auth/lifecycle-gate.js';
import { NotificationBell } from './notifications/bell.js';
import { AccountMenu } from './account/account-menu.js';
import { NavLinks } from './nav-links.js';
import { MobileNav } from './mobile-nav.js';
import { createSupabaseServerClient } from '../lib/supabase/server.js';
import { schoolLogoUrl } from '../lib/storage/school-logo.js';

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

  const items = NAV.filter((i) => i.roles.includes(role) && (allowMutate || !i.mutate)).map(
    (i) => ({ href: i.href, label: t(`nav.${i.key}`), icon: i.key }),
  );

  let logoUrl: string | null = null;
  if (schoolId) {
    const supabase = createSupabaseServerClient();
    const { data: school } = await supabase
      .from('school')
      .select('logo_path')
      .eq('id', schoolId)
      .maybeSingle<{ logo_path: string | null }>();
    logoUrl = schoolLogoUrl(school?.logo_path ?? null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-muted">
      {schoolId && <LifecycleBanner schoolId={schoolId} />}
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-2">
          <MobileNav items={items} menuLabel={t('menu')} closeLabel={t('closeMenu')} />
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          ) : null}
          <span className="text-lg font-bold text-primary">{t('title')}</span>
        </div>
        <div className="flex items-center gap-4">
          {schoolId && <NotificationBell />}
          <AccountMenu displayName={displayName} />
        </div>
      </header>
      <div className="flex">
        <nav className="hidden w-56 shrink-0 border-e border-border bg-surface p-4 md:block">
          <NavLinks items={items} />
        </nav>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
