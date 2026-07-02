import { createSupabaseServerClient } from '../../../lib/supabase/server.js';

interface SmsLogRow {
  id: string;
  student_id: string;
  recipient_phone: string;
  message_text: string;
  segments: number;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  is_manual: boolean;
  created_at: string;
  student: { name: string } | { name: string }[] | null;
}

const STATUS_LABEL: Record<SmsLogRow['status'], string> = {
  queued: 'قيد الانتظار',
  sent: 'أُرسلت',
  delivered: 'تم التسليم',
  failed: 'فشلت',
};

const STATUS_CLASS: Record<SmsLogRow['status'], string> = {
  queued: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

function studentName(row: SmsLogRow): string {
  const s = Array.isArray(row.student) ? row.student[0] : row.student;
  return s?.name ?? '';
}

/** SMS log view — per school (T122): recipient, text, segments, status, timestamp. */
export default async function SmsLogPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('sms_message_log')
    .select('id, student_id, recipient_phone, message_text, segments, status, is_manual, created_at, student:student_id(name)')
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<SmsLogRow[]>();

  const rows = data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">سجل الرسائل النصية</h1>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table dir="rtl" className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-semibold">الطالب</th>
              <th className="px-4 py-2 text-start font-semibold">الهاتف</th>
              <th className="px-4 py-2 text-start font-semibold">النص</th>
              <th className="px-4 py-2 text-start font-semibold">المقاطع</th>
              <th className="px-4 py-2 text-start font-semibold">الحالة</th>
              <th className="px-4 py-2 text-start font-semibold">النوع</th>
              <th className="px-4 py-2 text-start font-semibold">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  لا توجد رسائل بعد
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{studentName(r)}</td>
                  <td className="px-4 py-2">{r.recipient_phone}</td>
                  <td className="max-w-xs truncate px-4 py-2" title={r.message_text}>
                    {r.message_text}
                  </td>
                  <td className="px-4 py-2">{r.segments}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.is_manual ? 'يدوي' : 'تلقائي'}</td>
                  <td className="px-4 py-2">{new Date(r.created_at).toLocaleString('ar-SD')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
