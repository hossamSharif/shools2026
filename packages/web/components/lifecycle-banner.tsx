import { SubscriptionBanner } from '@erp/ui';
import { getLifecycleInfo } from '../lib/auth/lifecycle-gate.js';

/**
 * Server component (T129, US8/US6): resolves the derived lifecycle state for
 * the current school and renders the pinned countdown banner. Silent no-op
 * for super-admin (schoolId null).
 */
export async function LifecycleBanner({ schoolId }: { schoolId: string | null }) {
  const { state, daysRemaining } = await getLifecycleInfo(schoolId);
  return <SubscriptionBanner state={state} daysRemaining={daysRemaining} />;
}
