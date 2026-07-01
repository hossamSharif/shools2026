'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { recordExpense } from '../../lib/actions/money-events.js';

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

export function ExpenseForm({ accounts }: { accounts: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    setError(null);
    setOk(false);
    if (!accountId || !amount || !category.trim()) {
      setError('اختر الحساب وأدخل المبلغ والفئة');
      return;
    }
    startTransition(async () => {
      try {
        await recordExpense({
          account_id: accountId,
          amount,
          category: category.trim(),
          vendor: vendor || undefined,
          description: description || undefined,
          occurred_at: new Date().toISOString(),
          idempotency_key: crypto.randomUUID(),
        });
        setOk(true);
        setAmount('');
        setCategory('');
        setVendor('');
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
        <CardTitle>تسجيل مصروف</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="الحساب">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
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
        <Field label="الفئة">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثال: رواتب، صيانة" />
        </Field>
        <Field label="المورّد">
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="الوصف">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2 space-y-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-600">تم تسجيل المصروف</p> : null}
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'جارٍ الحفظ…' : 'تسجيل المصروف'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
