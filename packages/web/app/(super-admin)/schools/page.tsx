import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@erp/ui';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { formatDate } from '../../../lib/format/date.js';
import { formatNumber } from '../../../lib/format/number.js';
import { SchoolsTable } from '../../../components/super-admin/schools-table.js';

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
  const rows = schools.map((s) => {
    const sub = s.subscription?.[0];
    const credit = (s.sms_credit_topup ?? []).reduce((n, r) => n + r.amount, 0);
    return {
      id: s.id,
      name: s.name,
      subscriptionStart: sub ? formatDate(sub.period_start) : '—',
      subscriptionEnd: sub ? formatDate(sub.period_end) : '—',
      creditBalance: formatNumber(credit),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href="/schools/new">
          <Button>{t('new')}</Button>
        </Link>
      </div>

      <SchoolsTable
        data={rows}
        labels={{
          name: t('name'),
          subscriptionStart: t('subscriptionStart'),
          subscriptionEnd: t('subscriptionEnd'),
          creditBalance: t('creditBalance'),
          addCredit: t('addCredit'),
          empty: 'لا توجد مدارس بعد',
        }}
      />
    </div>
  );
}
