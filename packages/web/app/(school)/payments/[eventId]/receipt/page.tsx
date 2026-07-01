import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { formatDateTime } from '../../../../../lib/format/date.js';
import { formatCurrency } from '../../../../../lib/format/currency.js';
import { studentBalance } from '../../../../../lib/queries/balances.js';
import { ReceiptViewer } from '../../../../../components/payments/receipt-viewer.js';
import type { ReceiptData } from '../../../../../pdf/receipt.js';

interface EventRow {
  id: string;
  amount: number;
  occurred_at: string;
  receipt_no: number | null;
  student_id: string | null;
  account_id: string | null;
  student: { name: string } | null;
  account: { name: string } | null;
}

/** Fee-payment receipt page (US3). */
export default async function ReceiptPage({ params }: { params: { eventId: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: event } = await supabase
    .from('money_event')
    .select(
      'id, amount, occurred_at, receipt_no, student_id, account_id, student:student(name), account:account(name)',
    )
    .eq('id', params.eventId)
    .single<EventRow>();

  if (!event) notFound();

  let gradeLabel: string | undefined;
  let sectionName: string | undefined;
  let runningBalance: string | undefined;

  if (event.student_id) {
    const { data: enr } = await supabase
      .from('enrollment')
      .select('grade:grade(label_ar), section:section(name)')
      .eq('student_id', event.student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ grade: { label_ar: string } | null; section: { name: string } | null }>();
    gradeLabel = enr?.grade?.label_ar ?? undefined;
    sectionName = enr?.section?.name ?? undefined;
    runningBalance = formatCurrency(await studentBalance(event.student_id));
  }

  const data: ReceiptData = {
    receiptNo: event.receipt_no ?? 0,
    studentName: event.student?.name ?? '—',
    gradeLabel,
    sectionName,
    accountName: event.account?.name ?? '—',
    amount: formatCurrency(String(event.amount)),
    date: formatDateTime(event.occurred_at),
    runningBalance,
  };

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">إيصال دفع</h1>
      <ReceiptViewer data={data} />
    </div>
  );
}
