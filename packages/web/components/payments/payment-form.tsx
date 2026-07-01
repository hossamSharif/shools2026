'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { applyFeePayment } from '../../lib/actions/money-events.js';
import { studentInstallmentsClient } from '../../lib/actions/payment-helpers.js';

interface Option {
  id: string;
  label: string;
}
interface InstallmentRow {
  id: string;
  sequence: number;
  due_date: string;
  amount_charged: number;
  running_balance: string;
}

export function PaymentForm({
  students,
  accounts,
  studentId: fixedStudentId,
}: {
  students: Option[];
  accounts: Option[];
  studentId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState(fixedStudentId ?? '');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [receipt, setReceipt] = useState<{ no: number; eventId: string } | null>(null);

  const loadInstallments = (id: string) => {
    setInstallments([]);
    if (!id) return;
    setLoadingInst(true);
    startTransition(async () => {
      try {
        const rows = await studentInstallmentsClient(id);
        setInstallments(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل الأقساط');
      } finally {
        setLoadingInst(false);
      }
    });
  };

  const submit = () => {
    setError(null);
    setReceipt(null);
    if (!studentId || !accountId || !amount) {
      setError('اختر الطالب والحساب وأدخل المبلغ');
      return;
    }
    startTransition(async () => {
      try {
        const out = await applyFeePayment({
          student_id: studentId,
          account_id: accountId,
          amount,
          // NOTE: attachment upload left as a TODO — uploadAttachment is a
          // server-only helper; pass attachment_path here once a wired-up
          // upload flow exists.
          occurred_at: new Date().toISOString(),
          idempotency_key: crypto.randomUUID(),
        });
        setReceipt({ no: out.receipt_no, eventId: out.money_event_id });
        setAmount('');
        loadInstallments(studentId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>تسجيل دفعة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fixedStudentId ? null : (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">الطالب</span>
            <Select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                loadInstallments(e.target.value);
              }}
            >
              <option value="">اختر الطالب</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
        )}

        {loadingInst ? (
          <p className="text-sm text-gray-400">جارٍ تحميل الأقساط…</p>
        ) : installments.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <table dir="rtl" className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">القسط</th>
                  <th className="px-3 py-2 text-start font-semibold">الاستحقاق</th>
                  <th className="px-3 py-2 text-start font-semibold">الرصيد المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{r.sequence}</td>
                    <td className="px-3 py-2">{r.due_date}</td>
                    <td className="px-3 py-2">{r.running_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">الحساب</span>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">اختر الحساب</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">المبلغ</span>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>

        {/* TODO: مرفق الإيصال (attachment) — upload via server-only uploadAttachment then pass attachment_path. */}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {receipt ? (
          <p className="text-sm text-emerald-600">
            تم التسجيل — رقم الإيصال {receipt.no}.{' '}
            <Link
              href={`/payments/${receipt.eventId}/receipt`}
              className="underline"
            >
              عرض الإيصال
            </Link>
          </p>
        ) : null}

        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? 'جارٍ الحفظ…' : 'تسجيل الدفعة'}
        </Button>
      </CardContent>
    </Card>
  );
}
