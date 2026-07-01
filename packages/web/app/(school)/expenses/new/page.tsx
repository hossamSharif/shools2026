import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { ExpenseForm } from '../../../../components/money/expense-form.js';

interface AccountRow {
  id: string;
  name: string;
  type: 'cash' | 'bank';
}

/** Record expense (US4). */
export default async function NewExpensePage() {
  const supabase = createSupabaseServerClient();
  const { data: accounts } = await supabase
    .from('account')
    .select('id, name, type')
    .order('name', { ascending: true })
    .returns<AccountRow[]>();

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">مصروف جديد</h1>
      <ExpenseForm
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          label: `${a.name} (${a.type === 'cash' ? 'نقدي' : 'بنكي'})`,
        }))}
      />
    </div>
  );
}
