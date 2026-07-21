import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { ManualReminderButton } from '../../../../../components/sms/manual-reminder-button.js';
import {
  StudentSmsTable,
  type StudentSmsLogRow,
} from '../../../../../components/students/student-sms-table.js';

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
    .returns<StudentSmsLogRow[]>();

  const rows = data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">رسائل الطالب: {student?.name ?? ''}</h1>
        <ManualReminderButton studentId={params.studentId} />
      </div>

      <StudentSmsTable data={rows} />
    </div>
  );
}
