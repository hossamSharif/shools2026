import Link from 'next/link';

const TABS = [
  { href: '/settings/years', label: 'السنوات الدراسية' },
  { href: '/settings/grades', label: 'الصفوف والشعب' },
  { href: '/settings/fees', label: 'الرسوم' },
  { href: '/settings/accounts', label: 'الحسابات' },
  { href: '/settings/reminders', label: 'التذكيرات' },
  { href: '/settings/branding', label: 'الهوية البصرية' },
];

/**
 * Tab strip across the settings section's standalone pages — without it,
 * each page (years/grades/fees/accounts/reminders/branding) is reachable
 * only via a direct URL, since AppShell's single "settings" nav entry links
 * to /settings/years only.
 */
export function SettingsNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            tab.href === current
              ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
              : 'rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-muted hover:text-primary'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
