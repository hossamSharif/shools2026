import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { ReminderRulesForm } from '../../../../components/sms/reminder-rules-form.js';

interface ReminderRuleRow {
  id: string;
  offset_kind: 'before' | 'on' | 'after';
  days: number;
  enabled: boolean;
}

const KIND_LABEL: Record<ReminderRuleRow['offset_kind'], string> = {
  before: 'قبل الاستحقاق',
  on: 'يوم الاستحقاق',
  after: 'بعد الاستحقاق',
};

/** Reminder-rules config UI (T121): enable/disable + change before/after days. */
export default async function RemindersSettingsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('reminder_rule')
    .select('id, offset_kind, days, enabled')
    .order('offset_kind', { ascending: true })
    .returns<ReminderRuleRow[]>();

  const rules = data ?? [];

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">قواعد التذكير</h1>
      <p className="text-sm text-gray-500">
        يتم إرسال رسائل تذكير SMS تلقائيًا لأولياء الأمور حسب هذه القواعد (بتوقيت الخرطوم).
      </p>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table dir="rtl" className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-semibold">النوع</th>
              <th className="px-4 py-2 text-start font-semibold">عدد الأيام</th>
              <th className="px-4 py-2 text-start font-semibold">مفعّل</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  لا توجد قواعد بعد
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{KIND_LABEL[r.offset_kind]}</td>
                  <td className="px-4 py-2">
                    <ReminderRulesForm
                      ruleId={r.id}
                      days={r.days}
                      enabled={r.enabled}
                      editableDays={r.offset_kind !== 'on'}
                    />
                  </td>
                  <td className="px-4 py-2" />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
