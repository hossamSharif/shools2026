# Contract: Worker (`@erp/api`) endpoints added or changed

The worker is the only holder of `SUPABASE_SERVICE_ROLE_KEY` (unchanged). It never makes an
authorization decision itself. Every privileged step is decided in the DB, either by calling
an RPC **with the end user's JWT** (user-scoped client) or by calling a `service_role`-only
function whose inputs come from a validated token. All bodies are validated with Zod
(Article XI). The schemas live in `@erp/shared/schemas/access.ts`.

Internal endpoints keep the existing `INTERNAL_DISPATCH_TOKEN` bearer check (header
`x-internal-token`) **and** require `x-user-jwt: <access token>` of the acting user.

---

## `POST /internal/invitations/:id/send`

Sends (or resends) an invitation email.

Request: path `id` (uuid). Headers: `x-internal-token`, `x-user-jwt`. Empty body.

Steps:
1. Build a user-scoped Supabase client from `x-user-jwt`.
2. `rpc('issue_invitation_token', { p_invitation_id })`. This runs as the admin, and the DB
   checks `users.manage`, school, pending state and write gating. It returns the raw token.
3. Read the invitation email through the same user-scoped client.
4. Service client: `auth.admin.inviteUserByEmail(email, { data: { invite_token, school_name }, redirectTo: `${APP_URL}/auth/accept-invite` })`.
   If the auth user already exists and is unconfirmed (a resend), use
   `auth.admin.generateLink({ type: 'invite' })` through the same template. Store
   `auth_user_id` on the invitation through the service client.

Response `200 { sent: true }` · `403 { code }` passes the DB error code through ·
`502 { code: 'MAIL_FAILED' }`. The invitation stays pending, and the admin can resend.

Rate limit: 20/min per school (express-rate-limit keyed by the school id resolved in step 2).

---

## `POST /invitations/accept` (public)

```ts
const AcceptInvitationInput = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),     // base64url(32 bytes)
  display_name: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(128),
});
```

Steps:
1. Hash the token (SHA-256).
2. Service client: `rpc('accept_invitation', { p_token_hash, p_display_name, p_auth_user_id })`.
   The auth user id is looked up from the invitation's stored `auth_user_id`. The DB function
   does the single-use / expiry / state checks under a row lock.
3. `auth.admin.updateUserById(auth_user_id, { password, email_confirm: true })`.
4. `200 { email }`. Web then calls `signInWithPassword` and redirects to the role's home.

Errors: `400 { code: 'INVITATION_INVALID' }` for every token failure, so nothing leaks.
Rate limit: 10/min per IP. helmet + cors restricted to `APP_URL`.

If step 3 fails after step 2 has committed, the user exists with no password. The response
is `500 { code: 'PASSWORD_SET_FAILED' }`, and the accept page offers "forgot password"
(existing `/forgot-password` flow), which recovers it.

---

## `POST /internal/dispatch/manual` (changed)

Adds the required `x-user-jwt` header. Before the existing dispatch, the worker calls
`rpc('authorize_manual_sms', { p_student_id })` with the user-scoped client. On
`FORBIDDEN_*` it returns `403` and nothing is sent or charged. The credit, segment and log
behaviour is otherwise unchanged (Article VII). The web `sendManualReminder` action forwards
the session's access token.

---

## Cron (changed): daily job

The existing daily schedule also runs:
1. `rpc('expire_invitations')` (service role), which writes the audit rows.
2. For invitations that became `expired` or `revoked` and have an `auth_user_id` with no
   `public.user` row: `auth.admin.deleteUser(auth_user_id)`.

---

## Environment

| Var | Where | Purpose |
|---|---|---|
| `APP_URL` | worker | redirect/accept link base, CORS origin for `/invitations/accept` (new) |
| `WORKER_URL`, `INTERNAL_DISPATCH_TOKEN` | web + worker | existing; now also used for invitation endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` | worker only | existing |

Supabase Auth configuration (documented in quickstart, set in the dashboard or CLI config
through Supabase MCP where supported): an Arabic **Invite** email template whose link is
`{{ .RedirectTo }}?token={{ .Data.invite_token }}`. Add `${APP_URL}/auth/accept-invite` to the
redirect allow-list.
