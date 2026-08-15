'use client';

import { FilterBar, type FilterControl } from '../layout/index.js';

/** URL-driven filter rail for the payments list (date range · account · search). */
export function PaymentFilters({
  accounts,
  values,
}: {
  accounts: { id: string; label: string }[];
  values: Record<string, string | undefined>;
}) {
  const controls: FilterControl[] = [
    { kind: 'date', key: 'from', label: 'من تاريخ' },
    { kind: 'date', key: 'to', label: 'إلى تاريخ' },
    {
      kind: 'select',
      key: 'accountId',
      placeholder: 'كل الحسابات',
      options: accounts.map((a) => ({ value: a.id, label: a.label })),
    },
  ];

  return (
    <FilterBar
      values={values}
      controls={controls}
      search={{ key: 'q', placeholder: 'ابحث برقم الإيصال أو اسم الطالب…' }}
    />
  );
}
