'use server';

import { revalidatePath } from 'next/cache';
import {
  CreateInvitationInput,
  InvitationIdInput,
  SetUserRolesInput,
  UserIdInput,
  SetOptionalPermissionInput,
} from '@erp/shared/schemas';
import { createSupabaseServerClient } from '../supabase/server.js';
import { requirePermission } from '../auth/guard.js';
import { accessErrorMessage, throwAccessError } from '../auth/access-errors.js';

/**
 * User management server actions (spec 002, US3, T056). Every rule lives in
 * the definer functions of migration 0044; these actions validate input with
 * the shared Zod schemas, call the RPC as the signed-in admin and map the
 * database refusal codes to Arabic messages. The guard is defense in depth.
 */

async function ctx() {
  await requirePermission('users.manage');
  return createSupabaseServerClient();
}

/** Asks the worker to send (or resend) the invite mail, as this admin. */
async function sendInviteMail(invitationId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.WORKER_URL;
  const token = process.env.INTERNAL_DISPATCH_TOKEN;
  if (!base || !token) throw new Error('WORKER_URL / INTERNAL_DISPATCH_TOKEN غير مضبوطة');
  if (!session?.access_token) throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');

  const res = await fetch(`${base}/internal/invitations/${invitationId}/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-user-jwt': session.access_token },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === 'INVITE_MAIL_FAILED') throw new Error('تعذّر إرسال بريد الدعوة، حاول مرة أخرى');
    throw new Error(await accessErrorMessage({ message: body.error ?? '' }));
  }
}

export async function inviteStaff(input: unknown): Promise<{ invitationId: string }> {
  const parsed = CreateInvitationInput.parse(input);
  const supabase = await ctx();
  const { data, error } = await supabase.rpc('create_invitation', {
    p_email: parsed.email,
    p_roles: parsed.roles,
    p_stage_scope: parsed.stage_scope,
  });
  if (error) await throwAccessError(error);
  const invitationId = data as string;
  await sendInviteMail(invitationId);
  revalidatePath('/users');
  return { invitationId };
}

export async function resendInvitation(input: unknown): Promise<void> {
  const { invitation_id } = InvitationIdInput.parse(input);
  await ctx();
  await sendInviteMail(invitation_id);
  revalidatePath('/users');
}

export async function revokeInvitation(input: unknown): Promise<void> {
  const { invitation_id } = InvitationIdInput.parse(input);
  const supabase = await ctx();
  const { error } = await supabase.rpc('revoke_invitation', { p_invitation_id: invitation_id });
  if (error) await throwAccessError(error);
  revalidatePath('/users');
}

export async function setUserRoles(input: unknown): Promise<void> {
  const parsed = SetUserRolesInput.parse(input);
  const supabase = await ctx();
  const { error } = await supabase.rpc('set_user_roles', {
    p_user_id: parsed.user_id,
    p_roles: parsed.roles,
    p_stage_scope: parsed.stage_scope,
  });
  if (error) await throwAccessError(error);
  revalidatePath('/users');
}

export async function deactivateUser(input: unknown): Promise<void> {
  const { user_id } = UserIdInput.parse(input);
  const supabase = await ctx();
  const { error } = await supabase.rpc('deactivate_user', { p_user_id: user_id });
  if (error) await throwAccessError(error);
  revalidatePath('/users');
}

export async function reactivateUser(input: unknown): Promise<void> {
  const { user_id } = UserIdInput.parse(input);
  const supabase = await ctx();
  const { error } = await supabase.rpc('reactivate_user', { p_user_id: user_id });
  if (error) await throwAccessError(error);
  revalidatePath('/users');
}

/**
 * Switch one catalogue permission for a role (spec 002, US5). Postgres checks
 * users.manage, the catalogue (NOT_GRANTABLE), write gating for switch-on, and
 * writes the audit row.
 */
export async function setOptionalPermission(input: unknown): Promise<void> {
  const parsed = SetOptionalPermissionInput.parse(input);
  const supabase = await ctx();
  const { error } = await supabase.rpc('set_optional_permission', {
    p_role: parsed.role,
    p_key: parsed.key,
    p_enabled: parsed.enabled,
  });
  if (error) await throwAccessError(error);
  revalidatePath('/users/permissions');
}
