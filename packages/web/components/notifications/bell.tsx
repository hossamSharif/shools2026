'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '../../lib/supabase/client.js';

interface NotificationRow {
  id: string;
  type: 'payment_recorded' | 'low_sms_credit' | 'subscription_expiring';
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const LABELS: Record<NotificationRow['type'], string> = {
  payment_recorded: 'تم تسجيل دفعة',
  low_sms_credit: 'رصيد الرسائل منخفض',
  subscription_expiring: 'الاشتراك على وشك الانتهاء',
};

/**
 * Notification center bell (T133, US9). Client component: polls the
 * notification table (RLS-scoped to the caller's own rows — Article IV) and
 * lets the user mark items read via the `mark_notification_read` RPC.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from('notification')
      .select('id, type, payload, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setItems((data as unknown as NotificationRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = items.filter((i) => !i.read_at).length;

  async function markRead(id?: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc('mark_notification_read', { p_notification_id: id } as never);
    await load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="الإشعارات"
        data-testid="notification-bell"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100"
      >
        🔔
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-count"
            className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white"
          >
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-80 rounded-md border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b p-2">
            <span className="text-sm font-semibold">الإشعارات</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void markRead()}
                className="text-xs text-blue-600 hover:underline"
              >
                تعليم الكل كمقروء
              </button>
              <Link href="/notifications" className="text-xs text-gray-500 hover:underline">
                عرض الكل
              </Link>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="p-3 text-center text-sm text-gray-400">لا توجد إشعارات</li>
            )}
            {items.map((n) => (
              <li
                key={n.id}
                data-testid="notification-item"
                data-read={n.read_at != null}
                data-type={n.type}
                className={`cursor-pointer border-b p-3 text-sm ${n.read_at ? 'bg-white' : 'bg-blue-50'}`}
                onClick={() => void markRead(n.id)}
              >
                <div className="font-medium">{LABELS[n.type]}</div>
                <div className="text-xs text-gray-500">
                  {new Date(n.created_at).toLocaleString('ar-SD')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
