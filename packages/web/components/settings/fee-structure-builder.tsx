'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { createFeeStructure } from '../../lib/actions/spine.js';

interface Option {
  id: string;
  label: string;
}
interface Item {
  name: string;
  amount: string;
}
interface ScheduleRow {
  sequence: number;
  due_date: string;
  amount: string;
}

export function FeeStructureBuilder({ grades, years }: { grades: Option[]; years: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [gradeId, setGradeId] = useState('');
  const [yearId, setYearId] = useState('');
  const [items, setItems] = useState<Item[]>([{ name: '', amount: '' }]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([
    { sequence: 1, due_date: '', amount: '' },
  ]);

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const setSched = (i: number, patch: Partial<ScheduleRow>) =>
    setSchedule((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = () => {
    setServerError(null);
    setOk(false);
    if (!gradeId || !yearId) {
      setServerError('اختر الصف والسنة الدراسية');
      return;
    }
    startTransition(async () => {
      try {
        await createFeeStructure({
          grade_id: gradeId,
          academic_year_id: yearId,
          items: items
            .filter((it) => it.name.trim())
            .map((it) => ({ name: it.name.trim(), amount: it.amount || '0' })),
          schedule: schedule
            .filter((r) => r.due_date)
            .map((r) => ({
              sequence: Number(r.sequence),
              due_date: r.due_date,
              amount: r.amount || '0',
            })),
        });
        setOk(true);
        setItems([{ name: '', amount: '' }]);
        setSchedule([{ sequence: 1, due_date: '', amount: '' }]);
        router.refresh();
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>إنشاء هيكل رسوم</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">الصف</span>
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              <option value="">اختر الصف</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">السنة الدراسية</span>
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
              <option value="">اختر السنة</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">عناصر الرسوم</h3>
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={it.name}
                onChange={(e) => setItem(i, { name: e.target.value })}
                placeholder="اسم العنصر (مثال: رسوم التسجيل)"
              />
              <Input
                className="w-40"
                inputMode="decimal"
                value={it.amount}
                onChange={(e) => setItem(i, { amount: e.target.value })}
                placeholder="المبلغ"
              />
              <button
                type="button"
                onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                className="text-red-500 hover:underline"
              >
                حذف
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setItems((p) => [...p, { name: '', amount: '' }])}
          >
            إضافة عنصر
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">جدول الأقساط</h3>
          {schedule.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="w-24"
                type="number"
                min={1}
                value={r.sequence}
                onChange={(e) => setSched(i, { sequence: Number(e.target.value) })}
                placeholder="الترتيب"
              />
              <Input
                className="w-48"
                type="date"
                value={r.due_date}
                onChange={(e) => setSched(i, { due_date: e.target.value })}
              />
              <Input
                className="w-40"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => setSched(i, { amount: e.target.value })}
                placeholder="المبلغ"
              />
              <button
                type="button"
                onClick={() => setSchedule((p) => p.filter((_, idx) => idx !== i))}
                className="text-red-500 hover:underline"
              >
                حذف
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSchedule((p) => [
                ...p,
                { sequence: p.length + 1, due_date: '', amount: '' },
              ])
            }
          >
            إضافة قسط
          </Button>
        </div>

        {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
        {ok ? <p className="text-sm text-emerald-600">تم حفظ هيكل الرسوم</p> : null}
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? 'جارٍ الحفظ…' : 'حفظ هيكل الرسوم'}
        </Button>
      </CardContent>
    </Card>
  );
}
