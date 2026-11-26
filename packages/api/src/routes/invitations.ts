import { createHash } from 'node:crypto';
import { Router, type Router as RouterType } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AcceptInvitationInput } from '@erp/shared/schemas';
import { createSupabaseServiceClient } from '../supabase.js';
import { requireInternalToken } from '../middleware/internal-auth.js';
import { createUserScopedClient, requireUserJwt } from '../middleware/user-client.js';

/**
 * Invitation endpoints (spec 002, contracts/worker-endpoints.md, T053).
 *
 * The worker holds the service key, so it creates the auth user and sends the
 * invite mail; every authorization decision stays in Postgres:
 *   - send: `issue_invitation_token` runs AS THE ADMIN (forwarded JWT), so
 *     users.manage, same school, pending/unexpired and write gating are all
 *     checked by the database;
 *   - accept: `accept_invitation` (service role only) validates the hashed,
 *     single-use token under a row lock.
 *
 * The raw token travels only in the invite link (redirectTo query string). It
 * is not written to auth user metadata, so the database never stores it in
 * clear text (only its SHA-256 in invitation.token_hash).
 */
export const invitationsRouter: RouterType = Router();

const sha256Hex = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
const byteaHex = (hex: string) => `\\x${hex}`;

function appUrl(): string | null {
  const v = process.env.APP_URL?.replace(/\/+$/, '');
  return v && /^https?:\/\//.test(v) ? v : null;
}

/** Maps a Postgres refusal to an HTTP status and code (access-matrix §4). */
function dbRefusal(error: { message?: string } | null): { status: number; code: string } | null {
  const code = error?.message?.match(/^([A-Z_]{4,})/)?.[1];
  if (!code) return null;
  if (code.startsWith('FORBIDDEN')) return { status: 403, code };
  if (code === 'NOT_FOUND') return { status: 404, code };
  if (code === 'INVITATION_INVALID' || code === 'WRITES_GATED') return { status: 409, code };
  return null;
}

// ── POST /internal/invitations/:id/send ─────────────────────────────────────

const sendLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Per school (resolved from the admin's own session before this runs).
  keyGenerator: (_req, res) => `invite-send:${String(res.locals.schoolId ?? 'unknown')}`,
});

invitationsRouter.post(
  '/internal/invitations/:id/send',
  requireInternalToken,
  requireUserJwt,
  async (req, res, next) => {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' });
    res.locals.invitationId = parsed.data;
    const userClient = createUserScopedClient(res.locals.userJwt as string);
    const { data: access, error } = await userClient.rpc('my_access');
    const schoolId = (access as { school_id?: string | null } | null)?.school_id;
    if (error || !schoolId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    res.locals.schoolId = schoolId;
    res.locals.userClient = userClient;
    next();
  },
  sendLimiter,
  async (_req, res) => {
    const base = appUrl();
    if (!base) return res.status(500).json({ error: 'APP_URL_NOT_CONFIGURED' });
    const userClient = res.locals.userClient as ReturnType<typeof createUserScopedClient>;
    const invitationId = res.locals.invitationId as string;

    // 1. Token, issued and checked by Postgres as the admin.
    const { data: token, error: tokErr } = await userClient.rpc('issue_invitation_token', {
      p_invitation_id: invitationId,
    });
    if (tokErr || typeof token !== 'string') {
      const r = dbRefusal(tokErr);
      return r
        ? res.status(r.status).json({ error: r.code })
        : res.status(500).json({ error: 'INTERNAL_ERROR' });
    }

    // 2. The invitation as the admin sees it (RLS: users.read, own school).
    const { data: inv, error: invErr } = await userClient
      .from('invitation')
      .select('id, email, auth_user_id, school_id')
      .eq('id', invitationId)
      .single();
    if (invErr || !inv) return res.status(404).json({ error: 'NOT_FOUND' });
    const { data: school } = await userClient
      .from('school')
      .select('name')
      .eq('id', inv.school_id)
      .maybeSingle();

    // 3. Send (or resend) the Supabase invite mail with the service key.
    const service = createSupabaseServiceClient();
    const redirectTo = `${base}/auth/accept-invite?token=${encodeURIComponent(token)}`;
    if (inv.auth_user_id) {
      // Resend: the pending auth identity has no profile yet; replace it so a
      // fresh invite mail is sent with the rotated token.
      await service.auth.admin.deleteUser(inv.auth_user_id);
    }
    const { data: invited, error: mailErr } = await service.auth.admin.inviteUserByEmail(
      String(inv.email),
      { data: { school_name: school?.name ?? '' }, redirectTo },
    );
    if (mailErr || !invited?.user) {
      return res.status(502).json({ error: 'INVITE_MAIL_FAILED' });
    }
    const { error: updErr } = await service
      .from('invitation')
      .update({ auth_user_id: invited.user.id })
      .eq('id', inv.id);
    if (updErr) return res.status(500).json({ error: 'INTERNAL_ERROR' });

    return res.json({ sent: true });
  },
);

// ── POST /invitations/accept (public authentication flow, Article XVII) ─────

const acceptLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const acceptCors = cors({
  origin: (origin, cb) => cb(null, !origin || origin === appUrl()),
  methods: ['POST'],
});

invitationsRouter.options('/invitations/accept', acceptCors);
invitationsRouter.post('/invitations/accept', acceptCors, acceptLimiter, async (req, res) => {
  const parsed = AcceptInvitationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' });
  const { token, display_name, password } = parsed.data;
  const hash = byteaHex(sha256Hex(token));
  const service = createSupabaseServiceClient();

  // Every token failure answers the same INVITATION_INVALID (nothing leaks).
  const { data: inv } = await service
    .from('invitation')
    .select('auth_user_id, email')
    .eq('token_hash', hash)
    .maybeSingle();
  if (!inv?.auth_user_id) return res.status(400).json({ error: 'INVITATION_INVALID' });

  const { error: accErr } = await service.rpc('accept_invitation', {
    p_token_hash: hash,
    p_display_name: display_name,
    p_auth_user_id: inv.auth_user_id,
  });
  if (accErr) return res.status(400).json({ error: 'INVITATION_INVALID' });

  const { error: pwErr } = await service.auth.admin.updateUserById(inv.auth_user_id, {
    password,
    email_confirm: true,
  });
  if (pwErr) return res.status(500).json({ error: 'PASSWORD_SET_FAILED' });

  return res.json({ email: String(inv.email) });
});
