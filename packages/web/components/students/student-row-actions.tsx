'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, RowActions, type RowAction } from '../layout/index.js';
import { StudentFormDialog } from './student-form-dialog.js';
import { deleteStudent, setStudentStatus } from '../../lib/actions/spine.js';
import type { StudentDirectoryRow } from '../../lib/queries/students.js';

/**
 * Per-row menu for the students list: navigate to the money screens, edit in a
 * modal, archive/restore, or delete.
 *
 * Delete is deliberately disabled (with a reason, not silently) whenever the
 * row carries any financial footprint — the DB trigger would reject it anyway
 * (migration 0030), so the menu tells the operator to archive instead of
 * letting them discover the block by failing.
 */
export function StudentRowActions({ row }: { row: StudentDirectoryRow }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const id = row.student_id;
  const hasMoney = row.installments_total > 0 || Number(row.total_paid) > 0;
  const archived = row.status !== 'active';

  function changeStatus(status: 'active' | 'withdrawn') {
    setError(null);
    startTransition(async () => {
      try {
        await setStudentStatus(id, status);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  const actions: RowAction[] = [
    { label: 'ملف الطالب', href: `/students/${id}` },
    { label: 'كشف الحساب', href: `/students/${id}/statement` },
    { label: 'تسجيل دفعة', href: `/payments/new?studentId=${id}` },
    { label: 'تسجيل في صف', href: `/students/${id}/enroll` },
    { label: 'إضافة خصم', href: `/students/${id}/discount` },
    { label: 'إرسال رسالة', href: `/students/${id}/sms` },
    { label: 'تعديل', onSelect: () => setEditOpen(true) },
    {
      label: archived ? 'إلغاء الأرشفة' : 'أرشفة',
      onSelect: () => changeStatus(archived ? 'active' : 'withdrawn'),
    },
    {
      label: 'حذف',
      destructive: true,
      disabled: hasMoney,
      disabledReason: 'الطالب لديه سجل مالي — استخدم الأرشفة بدلاً من الحذف.',
      onSelect: () => setDeleteOpen(true),
    },
  ];

  return (
    <>
      <RowActions actions={actions} label={`إجراءات ${row.name}`} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}

      <StudentFormDialog
        trigger={false}
        open={editOpen}
        onOpenChange={setEditOpen}
        student={{
          id,
          name: row.name,
          guardian_name: row.guardian_name,
          guardian_phone: row.guardian_phone,
          status: row.status,
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف الطالب نهائياً"
        description={
          <>
            سيتم حذف بيانات <span className="font-semibold text-gray-900">{row.name}</span> نهائياً
            ولا يمكن التراجع. إذا كنت تريد إخراجه من القائمة فقط، استخدم الأرشفة.
          </>
        }
        confirmText={row.name}
        confirmLabel="حذف نهائي"
        onConfirm={async () => {
          await deleteStudent(id);
          router.refresh();
        }}
      />
    </>
  );
}
