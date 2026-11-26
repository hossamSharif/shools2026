# @erp/api — worker

Long-running process (Article VI): reminder dispatch cron, SMS delivery webhook,
manual SMS dispatch, and (spec 002) staff invitations. It is the only holder of
the Supabase service key; every authorization decision is made by Postgres.

## Environment

| Var | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | service client (worker only) |
| `SUPABASE_ANON_KEY` | user-scoped client built from a forwarded `x-user-jwt` (spec 002) |
| `INTERNAL_DISPATCH_TOKEN` | bearer token for `/internal/*`, shared with `@erp/web` |
| `APP_URL` | public web origin, e.g. `https://app.example.com`. **Required at boot** (spec 002): invite links and the accept-endpoint CORS origin are built from it |
| `SMS_*` | SMS provider and kill switch (see `.env.example`) |

Never commit values.

## Staff invitations (spec 002, US3)

Endpoints (`src/routes/invitations.ts`, contracts/worker-endpoints.md):

- `POST /internal/invitations/:id/send`: internal token + the admin's `x-user-jwt`.
  `issue_invitation_token` runs **as the admin**, so permission, school, pending
  state and write gating are checked by the database. The worker then sends the
  Supabase invite mail (rate limit 20/min per school). A resend rotates the token
  and replaces the pending auth identity.
- `POST /invitations/accept`: public authentication flow (Article XVII). Zod
  body, 10/min per IP. The token is SHA-256 hashed, and the service-role-only
  `accept_invitation` validates it. The worker then sets the password.
- Daily cron `src/cron/invitation-expiry.ts` (02:10 Africa/Khartoum): runs
  `expire_invitations()`, then deletes orphan auth identities of expired or
  revoked invitations.

**The raw token is never stored.** Only its SHA-256 is kept, in
`invitation.token_hash`. The token travels only inside the invite link: the
worker passes `redirectTo = ${APP_URL}/auth/accept-invite?token=<token>`, and
it is **not** placed in auth user metadata.

### Supabase Auth configuration (one-time, per project)

1. **Authentication → URL configuration → Redirect URLs**: add
   `${APP_URL}/auth/accept-invite**`. The `**` lets the `?token=` query string through.
2. **Authentication → Email templates → Invite user**: Arabic RTL body, with the
   standard confirmation link. Supabase appends the `redirectTo` above:

   ```html
   <div dir="rtl" style="font-family: sans-serif">
     <h2>دعوة للانضمام إلى {{ .Data.school_name }}</h2>
     <p>تمت دعوتك لإنشاء حساب في نظام إدارة المدرسة. صلاحية الدعوة 7 أيام.</p>
     <p><a href="{{ .ConfirmationURL }}">قبول الدعوة وإنشاء الحساب</a></p>
   </div>
   ```

The 7-day expiry, single use and revocation are enforced by the app's
`invitation` table (FR-026), not by Supabase's own link lifetime.
