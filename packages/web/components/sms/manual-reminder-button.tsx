'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@erp/ui';
import { sendManualReminder } from '../../lib/actions/reminders.js';

interface Props {
  studentId: string;
  installmentId?: string;
}

/** Manual-reminder send button (T123) — calls the worker's manual endpoint. */
export function ManualReminderButton({ studentId, installmentId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function onClick() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      try {
        const result = await sendManualReminder(studentId, installmentId);
        setMessage(`تم الإرسال (${result.status === 'sent' ? 'أُرسلت' : result.status})`);
        router.refresh();
      } catch (e) {
        setIsError(true);
        setMessage(e instanceof Error ? e.message : 'تعذّر الإرسال');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending}>
        {pending ? 'جارٍ الإرسال…' : 'إرسال تذكير الآن'}
      </Button>
      {message ? (
        <span className={`text-xs ${isError ? 'text-red-600' : 'text-emerald-700'}`}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
