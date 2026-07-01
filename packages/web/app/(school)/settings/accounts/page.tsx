import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { accountBalance } from '../../../../lib/queries/balances.js';
import { formatCurrency } from '../../../../lib/format/currency.js';
import { AccountForm } from '../../../../components/settings/account-form.js';

interface AccountRow {
  id: string;
  name: string;
  type: 'cash' | 'bank';
  account_number: string | null;
  opening_balance: string;
}

/** Accounts list (with live balance) + create form (US2). */
export default async function AccountsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('account')
    .select('id, name, type, account_number, opening_balance')
    .order('name', { ascending: true })
    .returns<AccountRow[]>();

  const accounts = data ?? [];
  const balances = await Promise.all(accounts.map((a) => accountBalance(a.id)));

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الحسابات</h1>

      <AccountForm />

      <div className="overflow-hidden rounded-lg border bg-white">
        <table dir="rtl" className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-start font-semibold">الاسم</th>
              <th className="px-4 py-2 text-start font-semibold">النوع</th>
              <th className="px-4 py-2 text-start font-semibold">رقم الحساب</th>
              <th className="px-4 py-2 text-start font-semibold">الرصيد الافتتاحي</th>
              <th className="px-4 py-2 text-start font-semibold">الرصيد الحالي</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  لا توجد حسابات بعد
                </td>
              </tr>
            ) : (
              accounts.map((a, i) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2">{a.type === 'cash' ? 'نقدي' : 'بنكي'}</td>
                  <td className="px-4 py-2">{a.account_number ?? '—'}</td>
                  <td className="px-4 py-2">{formatCurrency(a.opening_balance)}</td>
                  <td className="px-4 py-2">{formatCurrency(balances[i] ?? '0')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
