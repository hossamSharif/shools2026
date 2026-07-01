'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { recordAdjustment } from '../../lib/actions/money-events.js';

interface Option {
  id: string;
  label: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function AdjustmentForm({ students }: { students: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const submit = () => {
    setError(null);
    setOk(false);
    if (!studentId || !amount || !reason.trim()) {
      setError('اختر الطالب وأدخل المبلغ والسبب');
      return;
    }
    startTransition(async () => {
      try {
        await recordAdjustment({
          student_id: studentId,
          amount,
          reason: reason.trim(),
          occurred_at: new Date().toISOString(),
          idempotency_key: crypto.randomUUID(),
        });
        setOk(true);
        setAmount('');
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
        <CardTitle>تسجيل تسوية</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="الطالب">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">اختر الطالب</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المبلغ">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="السبب">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2 space-y-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-600">تم تسجيل التسوية</p> : null}
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'جارٍ الحفظ…' : 'تسجيل التسوية'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
