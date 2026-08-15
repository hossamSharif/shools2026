'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle } from '@erp/ui';
import { StudentForm, type StudentFormProps } from './student-form.js';

/**
 * Create/edit a student in a modal instead of a form pinned to the students
 * page. Wraps the existing `StudentForm` unchanged — it already branches on the
 * `student` prop, and `upsertStudent` already branches on `id`.
 *
 * Two usages:
 *  - uncontrolled: renders its own "+ طالب جديد" trigger (page header action)
 *  - controlled:   `open`/`onOpenChange` supplied by a row-actions menu (edit)
 */
export function StudentFormDialog({
  student,
  open: controlledOpen,
  onOpenChange,
  trigger = true,
}: StudentFormProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setUncontrolledOpen;

  return (
    <>
      {trigger && !isControlled ? (
        <Button type="button" onClick={() => setOpen(true)} data-testid="new-student">
          <Plus className="h-4 w-4" aria-hidden />
          طالب جديد
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="student-form-dialog">
          <DialogTitle>{student ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</DialogTitle>
          <div className="mt-4">
            <StudentForm
              student={student}
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
