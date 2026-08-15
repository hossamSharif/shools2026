'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@erp/ui';

/**
 * The `…` per-row menu used by the section tables.
 *
 * Deliberately headless rather than Radix: `@radix-ui/react-dropdown-menu` is
 * not a dependency of this workspace (only react-dialog and react-select are),
 * and a menu this small doesn't justify pulling one in. It still covers the
 * behaviour that matters — click-outside, Escape, and roving focus back to the
 * trigger on close.
 */

export interface RowAction {
  label: string;
  /** Navigate (href) or run a handler (onSelect) — exactly one. */
  href?: string;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Shown as a title tooltip when disabled — say *why* it's blocked. */
  disabledReason?: string;
}

export function RowActions({ actions, label = 'إجراءات' }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block text-start">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid="row-actions-trigger"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-gray-900"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          dir="rtl"
          data-testid="row-actions-menu"
          className="absolute z-40 mt-1 min-w-[11rem] rounded-md border border-border bg-surface py-1 shadow-lg"
          // Hang below the trigger, anchored to its start (right) edge in RTL.
          style={{ top: '100%', insetInlineStart: 0 }}
        >
          {actions.map((a) => {
            const base =
              'block w-full px-3 py-2 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40';
            const tone = a.destructive
              ? 'text-danger hover:bg-danger/10'
              : 'text-gray-700 hover:bg-muted';

            if (a.disabled) {
              return (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  disabled
                  title={a.disabledReason}
                  className={cn(base, tone)}
                >
                  {a.label}
                </button>
              );
            }
            if (a.href) {
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  role="menuitem"
                  className={cn(base, tone)}
                  onClick={() => setOpen(false)}
                >
                  {a.label}
                </Link>
              );
            }
            return (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                className={cn(base, tone)}
                onClick={() => {
                  setOpen(false);
                  a.onSelect?.();
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
