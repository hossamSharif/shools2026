import { z } from 'zod';
import { Uuid } from './primitives.js';
import {
  OPTIONAL_PERMISSION_KEYS,
  OPTIONAL_PERMISSION_ROLES,
  STAFF_ROLES,
} from '../access/keys.js';

/**
 * Access-control boundary schemas (feature 002, Article XI). Shapes follow
 * contracts/rpc-contracts.md and contracts/worker-endpoints.md exactly.
 */

export const StaffRole = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof StaffRole>;

/** Omitted/empty array for a role = school-wide (FR-018a). */
export const StageScope = z
  .object({
    principal: z.array(Uuid).optional(),
    student_affairs: z.array(Uuid).optional(),
  })
  .strict();
export type StageScope = z.infer<typeof StageScope>;

export const OptionalPermissionKey = z.enum(OPTIONAL_PERMISSION_KEYS);
export type OptionalPermissionKey = z.infer<typeof OptionalPermissionKey>;

export const UserStatus = z.enum(['invited', 'active', 'deactivated']);
export type UserStatus = z.infer<typeof UserStatus>;

/** Result of `rpc('my_access')`: the only source screens use to show/hide things. */
export const MyAccess = z.object({
  user_id: Uuid,
  school_id: Uuid.nullable(),
  status: UserStatus,
  roles: z.array(z.string()),
  is_staff: z.boolean(),
  is_super_admin: z.boolean(),
  permissions: z.array(z.string()),
  stage_scope: z.record(z.string(), z.array(Uuid).nullable()),
});
export type MyAccess = z.infer<typeof MyAccess>;

export const CreateInvitationInput = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  roles: z.array(StaffRole).min(1),
  stage_scope: StageScope.default({}),
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInput>;

export const SetUserRolesInput = z.object({
  user_id: Uuid,
  roles: z.array(StaffRole).min(1),
  stage_scope: StageScope.default({}),
});
export type SetUserRolesInput = z.infer<typeof SetUserRolesInput>;

export const UserIdInput = z.object({ user_id: Uuid });
export type UserIdInput = z.infer<typeof UserIdInput>;

export const InvitationIdInput = z.object({ invitation_id: Uuid });
export type InvitationIdInput = z.infer<typeof InvitationIdInput>;

export const SetOptionalPermissionInput = z.object({
  role: z.enum(OPTIONAL_PERMISSION_ROLES),
  key: OptionalPermissionKey,
  enabled: z.boolean(),
});
export type SetOptionalPermissionInput = z.infer<typeof SetOptionalPermissionInput>;

/** Worker `POST /invitations/accept` body. Token = base64url(32 bytes). */
export const AcceptInvitationInput = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  display_name: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(128),
});
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInput>;

export const ACCESS_AUDIT_ACTIONS = [
  'invitation_sent',
  'invitation_accepted',
  'invitation_revoked',
  'invitation_expired',
  'role_added',
  'role_removed',
  'stage_scope_changed',
  'user_deactivated',
  'user_reactivated',
  'optional_permission_changed',
] as const;
export const AccessAuditAction = z.enum(ACCESS_AUDIT_ACTIONS);
export type AccessAuditAction = z.infer<typeof AccessAuditAction>;

export const AccessAuditFilter = z.object({
  user_id: Uuid.optional(),
  action: AccessAuditAction.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().positive().max(500).default(100),
  before_id: z.number().int().positive().optional(),
});
export type AccessAuditFilter = z.infer<typeof AccessAuditFilter>;

/** Error vocabulary of contracts/access-matrix.md §4 (+ the data-model §2 guard code). */
export const AccessErrorCode = z.enum([
  'FORBIDDEN_PERMISSION',
  'FORBIDDEN_SCHOOL',
  'FORBIDDEN_STUDENT',
  'NOT_FOUND',
  'SELF_CHANGE_FORBIDDEN',
  'LAST_ADMIN_PROTECTED',
  'PORTAL_STAFF_MIX',
  'STAGE_SCOPE_NOT_ALLOWED',
  'ROLES_REQUIRED',
  'NOT_GRANTABLE',
  'EMAIL_IN_USE',
  'INVITATION_INVALID',
  'WRITES_GATED',
  'AUDIT_IMMUTABLE',
  'DIRECT_ROLE_CHANGE_FORBIDDEN',
]);
export type AccessErrorCode = z.infer<typeof AccessErrorCode>;
