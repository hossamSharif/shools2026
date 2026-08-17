'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 *
 * The menu is rendered through a **portal with fixed positioning**, not as an
 * absolutely-positioned child. The shared `DataTable` wraps its table in
 * `overflow-x-auto`, which clips any absolutely-positioned descendant — and the
 * actions column is the last column, i.e. hard against the *left* edge in RTL,
 * so the menu was being sliced in half. A portal escapes the scroll container
 * entirely; the coordinates below then keep it inside the viewport on both
 * axes, flipping above the trigger when there is no room below.
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

const GAP = 4;
const EDGE = 8;

export function RowActions({ actions, label = 'إجراءات' }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    setPos(null);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // Measure once the menu is in the DOM so the real width/height drive the
  // placement (the item labels are Arabic and vary in length). `useEffect`
  // rather than `useLayoutEffect`: this component is server-rendered as part of
  // the table markup, and useLayoutEffect warns during SSR. The `visibility`
  // guard below means the extra frame costs nothing visually.
  useEffect(() => {
    if (!open) return;
    const t = triggerRef.current?.getBoundingClientRect();
    if (!t) return;
    const m = menuRef.current?.getBoundingClientRect();
    const width = m?.width ?? 176;
    const height = m?.height ?? 0;

    // RTL default: align the menu's end (left) under the trigger, growing
    // leftward — then pull it back inside if that overflows either edge.
    let left = t.right - width;
    if (left + width > window.innerWidth - EDGE) left = window.innerWidth - EDGE - width;
    if (left < EDGE) left = EDGE;

    let top = t.bottom + GAP;
    if (height && top + height > window.innerHeight - EDGE) {
      const above = t.top - height - GAP;
      top = above >= EDGE ? above : Math.max(EDGE, window.innerHeight - EDGE - height);
    }

    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close(true);
    }
    // Fixed coordinates don't follow a scrolling ancestor, so close rather than
    // let the menu drift away from its row. `true` catches scrolls on the
    // table's own overflow container, which don't bubble.
    function onScrollOrResize() {
      close();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, close]);

  const itemBase =
    'block w-full whitespace-nowrap px-3 py-2 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      dir="rtl"
      data-testid="row-actions-menu"
      className="fixed z-50 min-w-[11rem] rounded-md border border-border bg-surface py-1 shadow-lg"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // Keep it out of sight for the measuring pass rather than flashing it
        // at the wrong coordinates.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {actions.map((a) => {
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
              className={cn(itemBase, tone)}
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
              className={cn(itemBase, tone)}
              onClick={() => close()}
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
            className={cn(itemBase, tone)}
            onClick={() => {
              close();
              a.onSelect?.();
            }}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="inline-block text-start">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid="row-actions-trigger"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-gray-900"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open ? createPortal(menu, document.body) : null}
    </div>
  );
}
