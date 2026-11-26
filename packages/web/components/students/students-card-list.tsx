'use client';

import Link from 'next/link';
import { Card, CardContent } from '@erp/ui';
import { formatCurrency } from '../../lib/format/currency.js';
import { formatDate } from '../../lib/format/date.js';
import type { StudentDirectoryRow } from '../../lib/queries/students.js';
import type { StudentCaps } from '../../lib/auth/student-caps.js';
import { FinStatusBadge } from './fin-status-badge.js';
import { StudentRowActions } from './student-row-actions.js';
import { STUDENT_STATUS_AR } from './labels.js';

/** Stacked-card fallback for the students list below `md`, where the table is
 * too cramped even with horizontal scroll. Carries the same fields as the
 * table so nothing is only reachable on desktop. */
export function StudentsCardList({
  students,
  caps,
}: {
  students: StudentDirectoryRow[];
  caps: StudentCaps;
}) {
  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          لا يوجد طلاب مطابقون لعوامل التصفية
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {students.map((s) => (
        <li key={s.student_id}>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/students/${s.student_id}`}
                  data-testid="student-link"
                  className="font-semibold text-primary hover:underline"
                >
                  {s.name}
                </Link>
                <StudentRowActions row={s} caps={caps} />
              </div>

              <div className="grid grid-cols-2 gap-1 text-sm text-gray-600">
                <span>ولي الأمر: {s.guardian_name ?? '—'}</span>
                <span>الهاتف: {s.guardian_phone ?? '—'}</span>
                <span>
                  الصف:{' '}
                  {s.grade_label
                    ? [s.grade_label, s.section_name].filter(Boolean).join(' - ')
                    : 'غير مسجّل'}
                </span>
                <span>حالة الطالب: {STUDENT_STATUS_AR[s.status]}</span>
                {caps.finance ? (
                  <>
                    <span className={Number(s.total_owed) > 0 ? 'text-danger' : undefined}>
                      المستحق: {formatCurrency(s.total_owed ?? '0')}
                    </span>
                    <span>
                      الاستحقاق القادم:{' '}
                      {s.next_due_date ? formatDate(`${s.next_due_date}T00:00:00Z`) : '—'}
                    </span>
                  </>
                ) : null}
              </div>

              {caps.indicator ? (
                <FinStatusBadge
                  status={s.fin_status}
                  variant={caps.finance ? 'student' : 'indicator'}
                />
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
