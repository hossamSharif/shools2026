'use client';

import { FilterBar, type FilterControl } from '../layout/index.js';

/** URL-driven filter rail for the expenses list (date range · account · category · search). */
export function ExpenseFilters({
  accounts,
  categories,
  values,
}: {
  accounts: { id: string; label: string }[];
  categories: string[];
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
    {
      kind: 'select',
      key: 'category',
      placeholder: 'كل الفئات',
      options: categories.map((c) => ({ value: c, label: c })),
      // A school that has never categorised an expense gets no empty dropdown.
      hiddenWhenEmpty: true,
    },
  ];

  return (
    <FilterBar
      values={values}
      controls={controls}
      search={{ key: 'q', placeholder: 'ابحث بالفئة أو المورد أو الوصف…' }}
    />
  );
}
