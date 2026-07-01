import { createSupabaseServerClient } from '../../../../lib/supabase/server.js';
import { PaymentForm } from '../../../../components/payments/payment-form.js';

interface StudentRow {
  id: string;
  name: string;
}
interface AccountRow {
  id: string;
  name: string;
  type: 'cash' | 'bank';
}

/** New fee-payment page — loads students + accounts for the form (US3). */
export default async function NewPaymentPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: students }, { data: accounts }] = await Promise.all([
    supabase
      .from('student')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from('account')
      .select('id, name, type')
      .order('name', { ascending: true })
      .returns<AccountRow[]>(),
  ]);

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">دفعة جديدة</h1>
      <PaymentForm
        students={(students ?? []).map((s) => ({ id: s.id, label: s.name }))}
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          label: `${a.name} (${a.type === 'cash' ? 'نقدي' : 'بنكي'})`,
        }))}
      />
    </div>
  );
}
