import { createSupabaseServerClient } from '../../../lib/supabase/server.js';
import { SmsLogTable, type SmsLogRow } from '../../../components/sms/sms-log-table.js';

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
      <SmsLogTable data={rows} />
    </div>
  );
}
