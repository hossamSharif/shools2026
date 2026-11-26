import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaff } from '../../../lib/auth/guard.js';

/** Modules a staff member may open, by permission key (contracts/web-routes.md). */
const MODULES: { href: string; navKey: string; perm: string }[] = [
  { href: '/dashboard', navKey: 'dashboard', perm: 'finance.totals' },
  { href: '/students', navKey: 'students', perm: 'students.read' },
  { href: '/payments', navKey: 'payments', perm: 'finance.write' },
  { href: '/reports/receivables', navKey: 'reports', perm: 'finance.read' },
  { href: '/users', navKey: 'users', perm: 'users.read' },
  { href: '/settings/years', navKey: 'settings', perm: 'settings.read' },
];

/**
 * Role landing page (spec 002, T061) for staff without the finance dashboard,
 * e.g. student affairs or a teacher before feature 02 ships allocations.
 */
export default async function HomePage() {
  const ctx = await requireStaff();
  const t = await getTranslations('home');
  const tr = await getTranslations('roles');
  const tn = await getTranslations('app.nav');
  const modules = MODULES.filter((m) => ctx.permissions.has(m.perm));

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">{t('greeting', { name: ctx.displayName })}</h1>
      <p className="text-sm text-muted-foreground">
        {t('rolesLabel')}: {ctx.roles.map((r) => tr(r)).join('، ')}
      </p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('modulesTitle')}</h2>
        {modules.length === 0 ? (
          <p className="rounded-md bg-muted p-4 text-sm">{t('noModules')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className="block rounded-md border border-border bg-surface p-4 font-medium hover:bg-muted"
                >
                  {tn(m.navKey)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
