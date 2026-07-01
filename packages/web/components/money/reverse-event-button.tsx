'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogClose,
} from '@erp/ui';
import { reverseEvent } from '../../lib/actions/money-events.js';

/** Reverse a money event with a required reason (US4). */
export function ReverseEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!reason.trim()) {
      setError('سبب العكس مطلوب');
      return;
    }
    startTransition(async () => {
      try {
        await reverseEvent({
          money_event_id: eventId,
          reason: reason.trim(),
          idempotency_key: crypto.randomUUID(),
        });
        setOpen(false);
        setReason('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          عكس
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>عكس العملية</DialogTitle>
        <p className="mt-2 text-sm text-gray-600">
          سيتم إنشاء عملية عكسية مقابلة. أدخل سبب العكس.
        </p>
        <div className="mt-4 space-y-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="سبب العكس"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="mt-6 flex justify-start gap-2">
          <Button type="button" variant="destructive" onClick={submit} disabled={pending}>
            {pending ? 'جارٍ العكس…' : 'تأكيد العكس'}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              إلغاء
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
