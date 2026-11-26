import cron from 'node-cron';
import { createSupabaseServiceClient } from '../supabase.js';

/**
 * Daily invitation expiry (spec 002, contracts/worker-endpoints.md, T054).
 *
 * 1. `expire_invitations()` (service role only) moves overdue pending
 *    invitations to `expired` and writes one `invitation_expired` audit row
 *    each, all inside the database.
 * 2. Auth identities created by the invite mail for invitations that ended
 *    expired or revoked, and that never became a `public.user`, are deleted,
 *    so no orphan login can be completed later.
 * Runs regardless of SMS_DISPATCH_ENABLED (it sends nothing).
 */
export async function runInvitationExpiry(): Promise<{ expired: number; orphansDeleted: number }> {
  const service = createSupabaseServiceClient();

  const { data: expired, error } = await service.rpc('expire_invitations');
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[invitation-expiry] expire_invitations failed', error);
    throw error;
  }

  const { data: ended, error: endedErr } = await service
    .from('invitation')
    .select('id, auth_user_id')
    .in('state', ['expired', 'revoked'])
    .not('auth_user_id', 'is', null);
  if (endedErr) throw endedErr;

  let orphansDeleted = 0;
  for (const inv of ended ?? []) {
    const authId = inv.auth_user_id as string;
    const { data: profile } = await service
      .from('user')
      .select('id')
      .eq('id', authId)
      .maybeSingle();
    if (profile) continue; // accepted elsewhere or a real account: never delete
    const { error: delErr } = await service.auth.admin.deleteUser(authId);
    // An already-deleted identity is fine; clear the pointer either way.
    if (!delErr || /not found/i.test(delErr.message ?? '')) {
      await service.from('invitation').update({ auth_user_id: null }).eq('id', inv.id);
      if (!delErr) orphansDeleted += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[invitation-expiry] expired=${expired ?? 0} orphan_auth_users_deleted=${orphansDeleted}`,
  );
  return { expired: (expired as number | null) ?? 0, orphansDeleted };
}

/** Daily at 02:10 Africa/Khartoum. Call once at boot. */
export function scheduleInvitationExpiry(): void {
  cron.schedule(
    '10 2 * * *',
    () => {
      runInvitationExpiry().catch(() => {
        /* logged above; retried tomorrow */
      });
    },
    { timezone: 'Africa/Khartoum' },
  );
}
