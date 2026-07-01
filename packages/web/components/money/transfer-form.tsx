'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { recordTransfer } from '../../lib/actions/money-events.js';

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

export function TransferForm({ accounts }: { accounts: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    setError(null);
    setOk(false);
    if (!fromId || !toId || !amount) {
      setError('اختر الحسابين وأدخل المبلغ');
      return;
    }
    if (fromId === toId) {
      setError('يجب اختلاف الحسابين');
      return;
    }
    startTransition(async () => {
      try {
        await recordTransfer({
          from_account_id: fromId,
          to_account_id: toId,
          amount,
          description: description || undefined,
          occurred_at: new Date().toISOString(),
          idempotency_key: crypto.randomUUID(),
        });
        setOk(true);
        setAmount('');
        setDescription('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>تحويل مالي</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="من حساب">
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">اختر الحساب</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="إلى حساب">
          <Select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">اختر الحساب</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المبلغ">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="الوصف">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 space-y-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-600">تم التحويل</p> : null}
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'جارٍ التحويل…' : 'تنفيذ التحويل'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
