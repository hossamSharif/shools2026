'use server';

import { AcceptInvitationInput } from '@erp/shared/schemas';

export type AcceptResult =
  | { ok: true; email: string }
  | {
      ok: false;
      error: 'INVITATION_INVALID' | 'PASSWORD_SET_FAILED' | 'INVALID_INPUT' | 'UNAVAILABLE';
    };

/**
 * Accept an invitation (spec 002, T059). Public: the invitee has no account
 * yet. Forwards to the worker's `/invitations/accept`, which hashes the token
 * and calls the service-role-only `accept_invitation`. The browser then signs
 * in with the new password.
 */
export async function acceptInvitation(input: unknown): Promise<AcceptResult> {
  const parsed = AcceptInvitationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const base = process.env.WORKER_URL;
  if (!base) return { ok: false, error: 'UNAVAILABLE' };

  const res = await fetch(`${base}/invitations/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  }).catch(() => null);
  if (!res) return { ok: false, error: 'UNAVAILABLE' };
  const body = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
  if (res.ok && body.email) return { ok: true, email: body.email };
  if (body.error === 'PASSWORD_SET_FAILED') return { ok: false, error: 'PASSWORD_SET_FAILED' };
  if (res.status === 400 && body.error === 'INVALID_INPUT')
    return { ok: false, error: 'INVALID_INPUT' };
  return { ok: false, error: 'INVITATION_INVALID' };
}
