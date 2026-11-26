'use client';

import { FilterBar, type FilterControl } from '../layout/index.js';

interface Ref {
  id: string;
  label: string;
}

/** Filter rail of the access audit (spec 002, US6): query-string params only. */
export function AccessAuditFilters({
  users,
  actions,
  values,
  labels,
}: {
  users: Ref[];
  actions: Ref[];
  values: Record<string, string | undefined>;
  labels: { user: string; action: string; from: string; to: string };
}) {
  const toOptions = (rows: Ref[]) => rows.map((r) => ({ value: r.id, label: r.label }));
  const controls: FilterControl[] = [
    { kind: 'select', key: 'user', placeholder: labels.user, options: toOptions(users) },
    { kind: 'select', key: 'action', placeholder: labels.action, options: toOptions(actions) },
    { kind: 'date', key: 'from', label: labels.from },
    { kind: 'date', key: 'to', label: labels.to },
  ];
  return <FilterBar values={values} controls={controls} />;
}
