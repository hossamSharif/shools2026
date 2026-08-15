'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle } from '@erp/ui';
import { ExpenseForm } from './expense-form.js';

/**
 * "+ مصروف جديد" modal for the expenses list. Wraps the existing `ExpenseForm`
 * unchanged; `/expenses/new` stays a working standalone route.
 */
export function ExpenseFormDialog({ accounts }: { accounts: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-testid="new-expense">
        <Plus className="h-4 w-4" aria-hidden />
        مصروف جديد
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) router.refresh();
        }}
      >
        <DialogContent
          className="max-h-[85vh] max-w-2xl overflow-y-auto"
          data-testid="expense-form-dialog"
        >
          <DialogTitle className="sr-only">تسجيل مصروف</DialogTitle>
          <ExpenseForm accounts={accounts} />
        </DialogContent>
      </Dialog>
    </>
  );
}
