'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@erp/ui';
import { ReminderRulesForm } from '../sms/reminder-rules-form.js';

export interface ReminderRuleRow {
  id: string;
  offset_kind: 'before' | 'on' | 'after';
  days: number;
  enabled: boolean;
}

const KIND_LABEL: Record<ReminderRuleRow['offset_kind'], string> = {
  before: 'قبل الاستحقاق',
  on: 'يوم الاستحقاق',
  after: 'بعد الاستحقاق',
};

const columns: ColumnDef<ReminderRuleRow, unknown>[] = [
  { id: 'kind', header: 'النوع', cell: (c) => KIND_LABEL[c.row.original.offset_kind] },
  {
    id: 'days',
    header: 'عدد الأيام',
    cell: (c) => (
      <ReminderRulesForm
        ruleId={c.row.original.id}
        days={c.row.original.days}
        enabled={c.row.original.enabled}
        editableDays={c.row.original.offset_kind !== 'on'}
      />
    ),
  },
];

/** Client-side wrapper around the shared DataTable — same pattern as StatementTable. */
export function ReminderRulesTable({ data }: { data: ReminderRuleRow[] }) {
  return <DataTable columns={columns} data={data} emptyMessage="لا توجد قواعد بعد" />;
}
