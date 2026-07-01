import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server.js';
import { studentInstallments } from '../../../../../lib/queries/balances.js';
import { DiscountForm } from '../../../../../components/money/discount-form.js';

/** Apply a discount to a student (US4). */
export default async function DiscountPage({ params }: { params: { studentId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: student } = await supabase
    .from('student')
    .select('id, name')
    .eq('id', params.studentId)
    .single<{ id: string; name: string }>();
  if (!student) notFound();

  const installments = await studentInstallments(student.id);

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold">خصم — {student.name}</h1>
      <DiscountForm
        studentId={student.id}
        installments={installments.map((i) => ({
          id: i.id,
          label: `قسط ${i.sequence} — ${i.due_date}`,
        }))}
      />
    </div>
  );
}
