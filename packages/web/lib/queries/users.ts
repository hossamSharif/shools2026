import { createSupabaseServerClient } from '../supabase/server.js';
import { formatDateTime } from '../format/date.js';
import type { Database } from '@erp/database/types';

/** Read models for the users screens (spec 002, T057). RPC-only: token_hash never leaves the DB. */

type Fn = Database['public']['Functions'];
export type SchoolUserRow = Fn['list_school_users']['Returns'][number] & {
  created_at_label: string;
  deactivated_at_label: string | null;
};
export type InvitationRow = Fn['list_invitations']['Returns'][number] & {
  expires_at_label: string;
  created_at_label: string;
};

export async function listSchoolUsers(): Promise<SchoolUserRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_school_users');
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({
    ...u,
    created_at_label: formatDateTime(u.created_at),
    deactivated_at_label: u.deactivated_at ? formatDateTime(u.deactivated_at) : null,
  }));
}

export async function listInvitations(): Promise<InvitationRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('list_invitations');
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    ...i,
    expires_at_label: formatDateTime(i.expires_at),
    created_at_label: formatDateTime(i.created_at),
  }));
}

export interface StageOption {
  id: string;
  label: string;
}

export async function listStages(): Promise<StageOption[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from('stage').select('id, label_ar').order('ordinal');
  return (data ?? []).map((s) => ({ id: s.id, label: s.label_ar }));
}
