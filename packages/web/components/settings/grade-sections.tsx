'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@erp/ui';
import { createSection } from '../../lib/actions/spine.js';

interface GradeRow {
  id: string;
  label_ar: string;
  ordinal: number;
  stage_id: string;
}
interface SectionRow {
  id: string;
  name: string;
  grade_id: string;
}

export function GradeSections({ grade, sections }: { grade: GradeRow; sections: SectionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!name.trim()) {
      setError('اسم الشعبة مطلوب');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createSection({ grade_id: grade.id, name: name.trim() });
        setName('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{grade.label_ar}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {sections.length === 0 ? (
            <span className="text-sm text-gray-400">لا توجد شعب</span>
          ) : (
            sections.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {s.name}
              </span>
            ))
          )}
        </div>
        <div className="flex max-w-sm items-start gap-2">
          <div className="flex-1 space-y-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الشعبة (مثال: أ)"
            />
            {error ? <span className="block text-xs text-red-600">{error}</span> : null}
          </div>
          <Button type="button" onClick={add} disabled={pending}>
            {pending ? '…' : 'إضافة شعبة'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
