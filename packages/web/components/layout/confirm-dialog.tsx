'use client';

import { useState, useTransition } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@erp/ui';

/**
 * Confirmation gate for destructive actions. `confirmText` turns on
 * type-to-confirm mode: the confirm button stays disabled until the operator
 * retypes the exact value (used for student deletion, which is irreversible).
 *
 * The action's own server-side guard is always the real protection — this is
 * only there to stop an accidental click.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  confirmText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmText?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = !confirmText || typed.trim() === confirmText.trim();

  function close(next: boolean) {
    if (!next) {
      setTyped('');
      setError(null);
    }
    onOpenChange(next);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm();
        close(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md" data-testid="confirm-dialog">
        <DialogTitle className="text-danger">{title}</DialogTitle>
        {description ? (
          <div className="mt-2 text-sm text-muted-foreground">{description}</div>
        ) : null}

        {confirmText ? (
          <label className="mt-4 block space-y-1">
            <span className="text-sm text-gray-700">
              اكتب <span className="font-semibold text-gray-900">{confirmText}</span> للتأكيد
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="confirm-input"
              autoComplete="off"
            />
          </label>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-danger" data-testid="confirm-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-start gap-2">
          <Button
            type="button"
            onClick={confirm}
            disabled={!ready || pending}
            data-testid="confirm-submit"
            variant="destructive"
          >
            {pending ? 'جارٍ التنفيذ…' : confirmLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={() => close(false)} disabled={pending}>
            {cancelLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
