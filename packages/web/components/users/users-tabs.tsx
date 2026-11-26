import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from '@erp/ui';

/** Tab links between the users list, the permissions screen and the audit log (spec 002). */
export async function UsersTabs({ active }: { active: 'users' | 'permissions' | 'audit' }) {
  const t = await getTranslations('users');
  const tabs = [
    { key: 'users' as const, href: '/users', label: t('tabUsers') },
    { key: 'permissions' as const, href: '/users/permissions', label: t('tabPermissions') },
    { key: 'audit' as const, href: '/users/audit', label: t('tabAudit') },
  ];
  return (
    <nav aria-label={t('title')} className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
            tab.key === active
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-gray-900',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
