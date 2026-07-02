'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@erp/ui';
import { setReminderRuleEnabled, updateReminderRuleDays } from '../../lib/actions/reminders.js';

interface Props {
  ruleId: string;
  days: number;
  enabled: boolean;
  editableDays: boolean;
}

/** Inline enable/disable + days editor for a single reminder_rule row (T121). */
export function ReminderRulesForm({ ruleId, days, enabled, editableDays }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localDays, setLocalDays] = useState(String(days));
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setReminderRuleEnabled(ruleId, !enabled);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  function onDaysBlur() {
    const parsed = Number(localDays);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === days) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateReminderRuleDays(ruleId, parsed);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {editableDays ? (
        <Input
          value={localDays}
          onChange={(e) => setLocalDays(e.target.value)}
          onBlur={onDaysBlur}
          inputMode="numeric"
          className="w-20"
          aria-label="عدد الأيام"
          disabled={pending}
        />
      ) : (
        <span className="text-gray-500">—</span>
      )}
      <Button
        type="button"
        variant={enabled ? 'primary' : 'outline'}
        onClick={onToggle}
        disabled={pending}
        aria-pressed={enabled}
      >
        {enabled ? 'مفعّل' : 'معطّل'}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
