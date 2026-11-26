import { getTranslations } from 'next-intl/server';
import { LifecycleBanner } from './lifecycle-banner.js';
import { getLifecycleInfo, writesAllowed } from '../lib/auth/lifecycle-gate.js';
import { NotificationBell } from './notifications/bell.js';
import { AccountMenu } from './account/account-menu.js';
import { NavLinks } from './nav-links.js';
import { MobileNav } from './mobile-nav.js';
import { createSupabaseServerClient } from '../lib/supabase/server.js';
import { schoolLogoUrl } from '../lib/storage/school-logo.js';

/** Who sees a nav entry (contracts/web-routes.md, Navigation). */
type NavGate =
  | { perm: string } // holds the permission key
  | { withoutPerm: string } // staff WITHOUT this key (the role landing page)
  | { staff: true } // any active staff member
  | { superAdmin: true }; // operator surface only

interface NavItem {
  href: string;
  key: string;
  gate: NavGate;
  /** Mutate surfaces (T128, US8): hidden outside the active lifecycle state. */
  mutate?: boolean;
}

export interface ShellAccess {
  permissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
  isStaff: boolean;
}

// Permission-scoped navigation. For school_admin, accountant and viewer this
// yields exactly the Phase 1 lists (responsive-nav.spec.ts, FR-036).
// Super-admin sees only the operator surface (schools; Article IV separation).
const NAV: NavItem[] = [
  { href: '/schools', key: 'schools', gate: { superAdmin: true } },
  { href: '/dashboard', key: 'dashboard', gate: { perm: 'finance.totals' } },
  { href: '/home', key: 'home', gate: { withoutPerm: 'finance.totals' } },
  { href: '/students', key: 'students', gate: { perm: 'students.read' } },
  // The section landing pages are the lists; `/payments/new` and
  // `/expenses/new` remain reachable as standalone routes. Still flagged
  // `mutate` so the whole section disappears outside the active lifecycle
  // state, exactly as before.
  { href: '/payments', key: 'payments', gate: { perm: 'finance.write' }, mutate: true },
  { href: '/expenses', key: 'expenses', gate: { perm: 'finance.write' }, mutate: true },
  { href: '/reports/receivables', key: 'reports', gate: { perm: 'finance.read' } },
  { href: '/sms', key: 'sms', gate: { perm: 'finance.read' } },
  { href: '/notifications', key: 'notifications', gate: { staff: true } },
  { href: '/settings/years', key: 'settings', gate: { perm: 'settings.read' } },
  { href: '/users', key: 'users', gate: { perm: 'users.read' } },
];

function visible(gate: NavGate, access: ShellAccess): boolean {
  if ('superAdmin' in gate) return access.isSuperAdmin;
  if (access.isSuperAdmin) return false;
  if ('staff' in gate) return access.isStaff;
  if ('withoutPerm' in gate) return access.isStaff && !access.permissions.has(gate.withoutPerm);
  return access.permissions.has(gate.perm);
}

/**
 * RTL app shell with permission-scoped nav. Server component (reads translations).
 * T128/T129 (US8): resolves the derived lifecycle state once, hides mutate nav
 * entries outside 'active', and pins the countdown banner. This is a UI
 * affordance only — every mutate RPC re-enforces write-gating server-side
 * regardless (Article IV — the DB is the sole authority).
 */
export async function AppShell({
  access,
  displayName,
  schoolId = null,
  children,
}: {
  access: ShellAccess;
  displayName: string;
  schoolId?: string | null;
  children: React.ReactNode;
}) {
  const t = await getTranslations('app');
  const { state } = await getLifecycleInfo(schoolId);
  const allowMutate = writesAllowed(state);

  const items = NAV.filter((i) => visible(i.gate, access) && (allowMutate || !i.mutate)).map(
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
