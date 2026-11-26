'use client';

import { useTranslations } from 'next-intl';
import { STAFF_ROLES, STAGE_SCOPABLE_ROLES } from '@erp/shared/access';
import type { StageScope, StaffRole } from '@erp/shared/schemas';
import type { StageOption } from '../../lib/queries/users.js';

/**
 * Staff role multi-select with optional stage scope for the principal and
 * student-affairs roles (FR-018a). No stage ticked = all stages (school-wide).
 */
export function RolePicker({
  roles,
  stageScope,
  stages,
  onChange,
  disabled,
}: {
  roles: StaffRole[];
  stageScope: StageScope;
  stages: StageOption[];
  onChange: (next: { roles: StaffRole[]; stageScope: StageScope }) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('roles');
  const ti = useTranslations('invite');

  const toggleRole = (r: StaffRole) => {
    const next = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
    const scope: StageScope = { ...stageScope };
    if (!next.includes(r) && (r === 'principal' || r === 'student_affairs')) delete scope[r];
    onChange({ roles: next, stageScope: scope });
  };

  const toggleStage = (r: 'principal' | 'student_affairs', id: string) => {
    const cur = stageScope[r] ?? [];
    const nextIds = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    const scope: StageScope = { ...stageScope, [r]: nextIds };
    if (nextIds.length === 0) delete scope[r];
    onChange({ roles, stageScope: scope });
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium text-gray-700">{ti('roles')}</legend>
      <div className="grid grid-cols-2 gap-2">
        {STAFF_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)} />
            {t(r)}
          </label>
        ))}
      </div>
      {STAGE_SCOPABLE_ROLES.filter((r) => roles.includes(r)).map((r) => (
        <div key={r} className="rounded-md border border-border p-3">
          <p className="text-sm font-medium">
            {ti('stages')}: {t(r)}
          </p>
          <p className="text-xs text-muted-foreground">{ti('stagesHint')}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {stages.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`${t(r)}: ${s.label}`}
                  checked={(stageScope[r] ?? []).includes(s.id)}
                  onChange={() => toggleStage(r, s.id)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
