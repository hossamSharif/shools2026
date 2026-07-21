import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import {
  ReminderRulesTable,
  type ReminderRuleRow,
} from '../../../../components/settings/reminder-rules-table.js';
import { SettingsNav } from '../../../../components/settings/settings-nav.js';

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
      <SettingsNav current="/settings/reminders" />
      <p className="text-sm text-gray-500">
        يتم إرسال رسائل تذكير SMS تلقائيًا لأولياء الأمور حسب هذه القواعد (بتوقيت الخرطوم).
      </p>

      <ReminderRulesTable data={rules} />
    </div>
  );
}
