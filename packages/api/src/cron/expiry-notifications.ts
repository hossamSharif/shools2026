import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import type { Database } from '@erp/database/types';

/**
 * Expiring-soon notification cron (T132, US9). Calls the DB-side
 * `emit_expiry_notifications` RPC (SECURITY DEFINER, service-role only —
 * EXECUTE is revoked from authenticated/anon), which notifies school_admin/
 * accountant users of schools whose subscription expires within the lookahead
 * window, at most once per calendar day (Africa/Khartoum) per school. All
 * dedup/idempotency logic lives in the DB function; this file is a thin
 * scheduler around it.
 */
function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set for the cron worker');
  }
  return createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
}

export async function runExpiryNotifications(withinDays = 7): Promise<number> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('emit_expiry_notifications', {
    p_within_days: withinDays,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[expiry-notifications] emit_expiry_notifications failed', error);
    throw error;
  }
  return (data as unknown as number) ?? 0;
}

/** Registers the daily 08:00 Africa/Khartoum cron job. Call once at boot. */
export function scheduleExpiryNotifications(): void {
  cron.schedule(
    '0 8 * * *',
    () => {
      void runExpiryNotifications().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[expiry-notifications] scheduled run failed', err);
      });
    },
    { timezone: 'Africa/Khartoum' },
  );
}
