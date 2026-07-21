import * as React from 'react';
import { cn } from '../lib/cn.js';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Native RTL select. Options are supplied as children. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      dir="rtl"
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
