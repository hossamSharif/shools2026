'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle } from '@erp/ui';
import { PaymentForm } from './payment-form.js';

interface Option {
  id: string;
  label: string;
}

/**
 * "+ دفعة جديدة" modal for the payments list. Wraps the existing `PaymentForm`
 * unchanged — `/payments/new` stays a working standalone route for deep links
 * and the existing E2E specs.
 */
export function PaymentFormDialog({
  students,
  accounts,
}: {
  students: Option[];
  accounts: Option[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-testid="new-payment">
        <Plus className="h-4 w-4" aria-hidden />
        دفعة جديدة
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // A payment may have been recorded before closing; pick up the new row.
          if (!next) router.refresh();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="payment-form-dialog">
          <DialogTitle className="sr-only">تسجيل دفعة</DialogTitle>
          <PaymentForm students={students} accounts={accounts} />
        </DialogContent>
      </Dialog>
    </>
  );
}
