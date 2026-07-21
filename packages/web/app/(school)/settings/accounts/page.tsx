import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { accountBalance } from '../../../../lib/queries/balances.js';
import { formatCurrency } from '../../../../lib/format/currency.js';
import { AccountForm } from '../../../../components/settings/account-form.js';
import { AccountsTable } from '../../../../components/settings/accounts-table.js';
import { SettingsNav } from '../../../../components/settings/settings-nav.js';

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
  const rows = accounts.map((a, i) => ({
    id: a.id,
    name: a.name,
    typeLabel: a.type === 'cash' ? 'نقدي' : 'بنكي',
    account_number: a.account_number,
    openingBalance: formatCurrency(a.opening_balance),
    currentBalance: formatCurrency(balances[i] ?? '0'),
  }));

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الحسابات</h1>
      <SettingsNav current="/settings/accounts" />

      <AccountForm />

      <AccountsTable data={rows} />
    </div>
  );
}
