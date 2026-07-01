'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@erp/ui';
import { topupSmsCredit } from '../../lib/actions/schools.js';
import { formatNumber } from '../../lib/format/number.js';

/** Add-SMS-credit action form. Generates a fresh idempotency key per submit. */
export function CreditForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [pending, startTransition] = useTransition();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('أدخل عدداً صحيحاً موجباً');
      return;
    }
    startTransition(async () => {
      try {
        const res = await topupSmsCredit({
          school_id: schoolId,
          amount: parsed,
          idempotency_key: crypto.randomUUID(),
        });
        setBalance(res.credit_balance_after);
        setAmount('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">عدد الرسائل المضافة</span>
        <Input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="مثال: ١٠٠٠"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {balance !== null ? (
        <p className="text-sm text-emerald-700">
          الرصيد الحالي: {formatNumber(balance)} رسالة
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'جارٍ الإضافة…' : 'إضافة رصيد'}
      </Button>
    </form>
  );
}
