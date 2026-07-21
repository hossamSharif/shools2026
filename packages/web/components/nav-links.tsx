import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Wallet,
  ReceiptText,
  BarChart3,
  MessageSquare,
  Bell,
  Settings,
  Building2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Nav `key` → Lucide icon. Keyed by a plain string (not a component reference)
 * so the pre-translated item list can cross the server→client boundary into
 * MobileNav without passing a function prop (see AppShell).
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  schools: Building2,
  dashboard: LayoutDashboard,
  students: Users,
  payments: Wallet,
  expenses: ReceiptText,
  reports: BarChart3,
  sms: MessageSquare,
  notifications: Bell,
  settings: Settings,
};

export interface NavLinkItem {
  href: string;
  label: string;
  /** Nav key resolved to an icon via NAV_ICONS (optional; falls back to none). */
  icon?: string;
}

/**
 * Presentational nav item list, shared by the persistent desktop rail and
 * the mobile sheet so both render identical markup from one filtered,
 * pre-translated list (role/lifecycle filtering + translation happens once,
 * server-side, in AppShell — labels are plain strings so this component and
 * its data can cross into the client-rendered MobileNav without passing a
 * function prop across the server/client boundary).
 */
export function NavLinks({
  items,
  onNavigate,
}: {
  items: NavLinkItem[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon ? NAV_ICONS[item.icon] : undefined;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-muted hover:text-primary"
            >
              {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
