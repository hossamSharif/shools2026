'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn.js';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/**
 * Side-anchored sheet (mobile nav drawer, filter panels). Distinct from
 * `Dialog` because `DialogContent` hardcodes a centered-modal transform that
 * doesn't work for a slide-in panel. Anchored to the logical start edge
 * (`start-0`/`border-e`) so it opens from the correct side under dir="rtl".
 */
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
    <DialogPrimitive.Content
      ref={ref}
      dir="rtl"
      className={cn(
        'fixed inset-y-0 start-0 z-50 h-full w-72 max-w-[85vw] border-e border-border bg-surface p-4 shadow-lg',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-start',
        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-start',
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

export function SheetTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}
