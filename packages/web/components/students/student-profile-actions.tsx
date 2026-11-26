'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Printer, FileDown, Wallet, Pencil } from 'lucide-react';
import { Button } from '@erp/ui';
import { RowActions, type RowAction } from '../layout/index.js';
import { StudentFormDialog } from './student-form-dialog.js';
import type { StudentCaps } from '../../lib/auth/student-caps.js';

/**
 * Header action group for the student profile. Print goes through the browser's
 * own print dialog (the page is laid out to print cleanly); PDF reuses the
 * existing server-rendered statement route rather than printing to file.
 *
 * Spec 002: each action shows only with the permission its path requires.
 */
export function StudentProfileActions({
  student,
  caps,
}: {
  caps: StudentCaps;
  student: {
    id: string;
    name: string;
    guardian_name: string | null;
    guardian_phone: string | null;
    status: 'active' | 'withdrawn' | 'graduated';
  };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const id = student.id;

  const more: RowAction[] = [
    ...(caps.financeWrite ? [{ label: 'إضافة خصم', href: `/students/${id}/discount` }] : []),
    ...(caps.write ? [{ label: 'تسجيل في صف', href: `/students/${id}/enroll` }] : []),
    ...(caps.finance
      ? [
          { label: 'الرسائل النصية', href: `/students/${id}/sms` },
          { label: 'كشف الحساب', href: `/students/${id}/statement` },
        ]
      : []),
  ];

  return (
    <>
      <Button type="button" onClick={() => window.print()} variant="outline">
        <Printer className="h-4 w-4" aria-hidden />
        طباعة
      </Button>

      {caps.finance ? (
        <a
          href={`/students/${id}/statement/pdf`}
          target="_blank"
          rel="noreferrer"
          data-testid="statement-pdf"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          <FileDown className="h-4 w-4" aria-hidden />
          تصدير PDF
        </a>
      ) : null}

      {caps.financeWrite ? (
        <Link
          href={`/payments/new?studentId=${id}`}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Wallet className="h-4 w-4" aria-hidden />
          تسجيل دفعة
        </Link>
      ) : null}

      {caps.write ? (
        <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" aria-hidden />
          تعديل
        </Button>
      ) : null}

      {more.length > 0 ? <RowActions actions={more} label="إجراءات إضافية" /> : null}

      {caps.write ? (
        <StudentFormDialog
          trigger={false}
          open={editOpen}
          onOpenChange={setEditOpen}
          student={student}
        />
      ) : null}
    </>
  );
}
