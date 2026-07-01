import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { CreditForm } from '../../../../../components/super-admin/credit-form.js';

/** Add-SMS-credit page for one school (US1, FR-037). */
export default async function SchoolCreditPage({
  params,
}: {
  params: { schoolId: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: school } = await supabase
    .from('school')
    .select('id, name')
    .eq('id', params.schoolId)
    .single<{ id: string; name: string }>();

  if (!school) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">إضافة رصيد رسائل — {school.name}</h1>
      <CreditForm schoolId={school.id} />
    </div>
  );
}
