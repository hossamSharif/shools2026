'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requireAuth } from '../auth/guard.js';
import { callRpc } from '../rpc/call.js';

/**
 * Self-service account actions (own profile only). Any authenticated school role
 * may rename themselves or sign out. Display-name writes go through the
 * `update_own_display_name` RPC (public.user has no self-UPDATE policy, and the
 * RPC never exposes role/school_id — no escalation surface). Password/email
 * changes stay on the browser client (Supabase auth flows) in the form component.
 */

const DisplayNameArgs = z.object({ p_display_name: z.string().trim().min(1) });

export async function updateDisplayName(input: { display_name: string }): Promise<void> {
  await requireAuth();
  const supabase = createSupabaseServerClient();

  await callRpc(
    supabase,
    'update_own_display_name',
    { p_display_name: input.display_name },
    DisplayNameArgs,
    z.unknown(), // void RPC → Supabase returns null
  );

  revalidatePath('/account');
  revalidatePath('/', 'layout'); // header shows the display name
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
