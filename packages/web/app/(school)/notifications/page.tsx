import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { Card, CardContent } from '@erp/ui';

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

/** Notification center (T133, US9): full list, own-user + own-school only (RLS). */
export default async function NotificationsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('notification')
    .select('id, type, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .returns<NotificationRow[]>();

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الإشعارات</h1>
      <Card>
        <CardContent className="divide-y p-0">
          {items.length === 0 && <p className="p-4 text-center text-gray-400">لا توجد إشعارات</p>}
          {items.map((n) => (
            <div
              key={n.id}
              data-testid="notification-item"
              data-read={n.read_at != null}
              data-type={n.type}
              className={`p-4 ${n.read_at ? '' : 'bg-blue-50'}`}
            >
              <div className="font-medium">{LABELS[n.type]}</div>
              <div className="text-xs text-gray-500">
                {new Date(n.created_at).toLocaleString('ar-SD')}
              </div>
              <pre className="mt-1 text-xs text-gray-400" dir="ltr">
                {JSON.stringify(n.payload)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
