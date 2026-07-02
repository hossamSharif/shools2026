import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { ManualReminderButton } from '../../../../../components/sms/manual-reminder-button.js';

interface SmsLogRow {
  id: string;
  recipient_phone: string;
  message_text: string;
  segments: number;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  is_manual: boolean;
  created_at: string;
}

const STATUS_LABEL: Record<SmsLogRow['status'], string> = {
  queued: 'قيد الانتظار',
  sent: 'أُرسلت',
  delivered: 'تم التسليم',
  failed: 'فشلت',
};

/** SMS log view — per student (T122), with a manual-reminder send button. */
export default async function StudentSmsPage({
  params,
}: {
  params: { studentId: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: student } = await supabase
    .from('student')
    .select('id, name')
    .eq('id', params.studentId)
    .maybeSingle();

  const { data } = await supabase
    .from('sms_message_log')
    .select('id, recipient_phone, message_text, segments, status, is_manual, created_at')
    .eq('student_id', params.studentId)
    .order('created_at', { ascending: false })
    .returns<SmsLogRow[]>();

  const rows = data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">رسائل الطالب: {student?.name ?? ''}</h1>
        <ManualReminderButton studentId={params.studentId} />
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table dir="rtl" className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-semibold">الهاتف</th>
              <th className="px-4 py-2 text-start font-semibold">النص</th>
              <th className="px-4 py-2 text-start font-semibold">الحالة</th>
              <th className="px-4 py-2 text-start font-semibold">النوع</th>
              <th className="px-4 py-2 text-start font-semibold">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  لا توجد رسائل بعد لهذا الطالب
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.recipient_phone}</td>
                  <td className="max-w-md truncate px-4 py-2" title={r.message_text}>
                    {r.message_text}
                  </td>
                  <td className="px-4 py-2">{STATUS_LABEL[r.status]}</td>
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
