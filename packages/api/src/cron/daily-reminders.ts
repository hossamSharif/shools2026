import cron from 'node-cron';
import { createSupabaseServiceClient } from '../supabase.js';
import { runDispatchForSchool } from '../dispatch/run-dispatch.js';
import { getSmsProvider } from '../providers/index.js';

/**
 * daily-reminders (T120) — schedules the reminder dispatch once per day
 * (default 08:00 Africa/Khartoum). Iterates every school; paused schools
 * (grace/locked) are skipped inside `runDispatchForSchool` (DISPATCH_PAUSED).
 */
export function scheduleDailyReminders(): void {
  const expr = process.env.DAILY_REMINDERS_CRON ?? '0 8 * * *';
  cron.schedule(
    expr,
    async () => {
      await runDailyReminders();
    },
    { timezone: 'Africa/Khartoum' },
  );
}

export async function runDailyReminders(): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const provider = getSmsProvider();

  const { data: schools, error } = await supabase.from('school').select('id');
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[daily-reminders] failed to list schools', error);
    return;
  }

  for (const school of schools ?? []) {
    try {
      await runDispatchForSchool(supabase, provider, school.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[daily-reminders] dispatch failed for school ${school.id}`, err);
    }
  }
}
