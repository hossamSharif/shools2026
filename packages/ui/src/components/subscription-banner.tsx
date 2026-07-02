import * as React from 'react';
import { cn } from '../lib/cn.js';

export type LifecycleState = 'active' | 'grace' | 'locked';

export interface SubscriptionBannerProps {
  /** Derived lifecycle state (from public.subscription_state — Article II/IV). */
  state: LifecycleState;
  /** Days remaining until period_end (active) or until lock (grace). Omit/undefined hides the count. */
  daysRemaining?: number | null;
  className?: string;
}

const COPY: Record<LifecycleState, { label: string; tone: string }> = {
  active: {
    label: 'الاشتراك نشط',
    tone: 'bg-green-50 text-green-800 border-green-200',
  },
  grace: {
    label: 'انتهت فترة الاشتراك — وضع القراءة فقط (فترة سماح)',
    tone: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  locked: {
    label: 'الحساب مقفل — العرض والتصدير فقط، لا يمكن إضافة عمليات مالية جديدة',
    tone: 'bg-red-50 text-red-900 border-red-300',
  },
};

/**
 * Pinned countdown banner (T129, US6 + US8). Presentational only — the caller
 * (packages/web/components/lifecycle-banner.tsx) resolves `state` +
 * `daysRemaining` server-side from public.subscription_state (Article IV: the
 * DB is the sole write-gating authority; this banner only REFLECTS it).
 */
export function SubscriptionBanner({ state, daysRemaining, className }: SubscriptionBannerProps) {
  if (state === 'active' && (daysRemaining === undefined || daysRemaining === null)) {
    return null;
  }

  const { label, tone } = COPY[state];

  return (
    <div
      role="status"
      data-lifecycle-state={state}
      className={cn('sticky top-0 z-40 border-b px-4 py-2 text-center text-sm font-medium', tone, className)}
    >
      <span>{label}</span>
      {typeof daysRemaining === 'number' && daysRemaining >= 0 && (
        <span className="ms-2 font-bold">
          {state === 'active'
            ? `(${daysRemaining} يوم متبقي)`
            : state === 'grace'
              ? `(${daysRemaining} يوم قبل القفل)`
              : ''}
        </span>
      )}
    </div>
  );
}
