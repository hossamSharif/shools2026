import { getTranslations } from 'next-intl/server';
import { requirePermission } from '../../../lib/auth/guard.js';
import { getLifecycleInfo, writesAllowed } from '../../../lib/auth/lifecycle-gate.js';
import { listInvitations, listSchoolUsers, listStages } from '../../../lib/queries/users.js';
import { PageHeader } from '../../../components/layout/index.js';
import { InviteDialog } from '../../../components/users/invite-dialog.js';
import { InvitationsList } from '../../../components/users/invitations-list.js';
import { UsersTable } from '../../../components/users/users-table.js';
import { UsersTabs } from '../../../components/users/users-tabs.js';

/**
 * Staff users of the school (spec 002, US3, T058). Read with users.read
 * (school admin, principal); every action needs users.manage and is checked
 * again by the database. In grace/locked, grants are disabled but
 * deactivation, role removal and revoking invitations stay available (FR-023).
 */
export default async function UsersPage() {
  const ctx = await requirePermission('users.read');
  const t = await getTranslations('users');
  const canManage = ctx.permissions.has('users.manage');
  const [{ state }, users, invitations, stages] = await Promise.all([
    getLifecycleInfo(ctx.schoolId),
    listSchoolUsers(),
    listInvitations(),
    listStages(),
  ]);
  const allowGrants = writesAllowed(state);

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={canManage && allowGrants ? <InviteDialog stages={stages} /> : null}
      />
      <UsersTabs active="users" />
      {canManage && !allowGrants ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {t('readOnlyBanner')}
        </p>
      ) : null}
      <UsersTable
        users={users}
        stages={stages}
        currentUserId={ctx.userId}
        canManage={canManage}
        writesAllowed={allowGrants}
      />
      <InvitationsList
        invitations={invitations}
        canManage={canManage}
        writesAllowed={allowGrants}
      />
    </div>
  );
}
