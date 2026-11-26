'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@erp/ui';
import { setOptionalPermission } from '../../lib/actions/users.js';

/**
 * One optional switch (spec 002, US5). Switching on is a grant: disabled in
 * grace/locked (`allowGrants` false). Switching off is a revocation and stays
 * available (FR-023). Postgres decides in every case; this only reflects it.
 */
export function PermissionSwitch({
  role,
  permissionKey,
  label,
  enabled,
  canManage,
  allowGrants,
}: {
  role: string;
  permissionKey: string;
  label: string;
  enabled: boolean;
  canManage: boolean;
  allowGrants: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const disabled = pending || !canManage || (!enabled && !allowGrants);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setOptionalPermission({ role, key: permissionKey, enabled: !enabled });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={disabled}
        onClick={toggle}
        data-testid={`switch-${role}-${permissionKey}`}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          enabled ? 'bg-primary' : 'bg-muted',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            // RTL: "on" moves the knob to the left.
            enabled ? '-translate-x-5' : '-translate-x-0.5',
          )}
        />
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
