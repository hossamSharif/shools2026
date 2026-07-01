import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button, Card, CardContent } from '@erp/ui';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { formatDate } from '../../../lib/format/date.js';
import { formatNumber } from '../../../lib/format/number.js';

interface SchoolRow {
  id: string;
  name: string;
  created_at: string;
  subscription: { period_start: string; period_end: string; grace_days: number }[];
  sms_credit_topup: { amount: number }[];
}

/**
 * Super-admin schools list (US1): each school with its subscription window and
 * granted SMS credit (Σtopups — super-admin is walled off from consumption rows,
 * so this shows credit granted). RLS returns only what the operator may see.
 */
export default async function SchoolsPage() {
  const t = await getTranslations('superAdmin.schools');
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from('school')
    .select(
      'id, name, created_at, subscription(period_start, period_end, grace_days), sms_credit_topup(amount)',
    )
    .order('created_at', { ascending: false })
    .returns<SchoolRow[]>();

  const schools = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href="/schools/new">
          <Button>{t('new')}</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <table dir="rtl" className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">{t('name')}</th>
                <th className="px-4 py-2 text-start font-semibold">{t('subscriptionStart')}</th>
                <th className="px-4 py-2 text-start font-semibold">{t('subscriptionEnd')}</th>
                <th className="px-4 py-2 text-start font-semibold">{t('creditBalance')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    لا توجد مدارس بعد
                  </td>
                </tr>
              ) : (
                schools.map((s) => {
                  const sub = s.subscription?.[0];
                  const credit = (s.sms_credit_topup ?? []).reduce((n, r) => n + r.amount, 0);
                  return (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">{s.name}</td>
                      <td className="px-4 py-2">
                        {sub ? formatDate(sub.period_start) : '—'}
                      </td>
                      <td className="px-4 py-2">{sub ? formatDate(sub.period_end) : '—'}</td>
                      <td className="px-4 py-2">{formatNumber(credit)}</td>
                      <td className="px-4 py-2 text-start">
                        <Link
                          href={`/schools/${s.id}/credit`}
                          className="text-emerald-600 hover:underline"
                        >
                          {t('addCredit')}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
