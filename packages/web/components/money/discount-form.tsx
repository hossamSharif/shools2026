'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { applyDiscount } from '../../lib/actions/money-events.js';

interface Option {
  id: string;
  label: string;
}
type Kind = 'percentage' | 'fixed' | 'sibling_waiver';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function DiscountForm({
  studentId,
  installments,
}: {
  studentId: string;
  installments: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [kind, setKind] = useState<Kind>('percentage');
  const [value, setValue] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [reason, setReason] = useState('');

  const submit = () => {
    setError(null);
    setOk(false);
    if (!value) {
      setError('أدخل قيمة الخصم');
      return;
    }
    startTransition(async () => {
      try {
        await applyDiscount({
          student_id: studentId,
          kind,
          value,
          installment_id: installmentId || undefined,
          reason: reason || undefined,
          idempotency_key: crypto.randomUUID(),
        });
        setOk(true);
        setValue('');
        setReason('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>تطبيق خصم</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="نوع الخصم">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="percentage">نسبة مئوية</option>
            <option value="fixed">مبلغ ثابت</option>
            <option value="sibling_waiver">إعفاء أخوة</option>
          </Select>
        </Field>
        <Field label={kind === 'percentage' ? 'النسبة (%)' : 'القيمة'}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </Field>
        <Field label="القسط (اختياري)">
          <Select value={installmentId} onChange={(e) => setInstallmentId(e.target.value)}>
            <option value="">كل الأقساط</option>
            {installments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="السبب (اختياري)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 space-y-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-600">تم تطبيق الخصم</p> : null}
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'جارٍ الحفظ…' : 'تطبيق الخصم'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
