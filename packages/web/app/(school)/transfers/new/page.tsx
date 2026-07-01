import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { TransferForm } from '../../../../components/money/transfer-form.js';

interface AccountRow {
  id: string;
  name: string;
  type: 'cash' | 'bank';
}

/** Record transfer between accounts (US4). */
export default async function NewTransferPage() {
  const supabase = createSupabaseServerClient();
  const { data: accounts } = await supabase
    .from('account')
    .select('id, name, type')
    .order('name', { ascending: true })
    .returns<AccountRow[]>();

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">تحويل بين الحسابات</h1>
      <TransferForm
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          label: `${a.name} (${a.type === 'cash' ? 'نقدي' : 'بنكي'})`,
        }))}
      />
    </div>
  );
}
