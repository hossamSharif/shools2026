// Shared section-layout primitives: header · KPI strip · filter rail · row menu
// · destructive confirmation. Applied to students, payments and expenses.
export { PageHeader } from './page-header.js';
export { SectionKpis, type SectionKpi } from './section-kpis.js';
export {
  FilterBar,
  type FilterBarProps,
  type FilterControl,
  type FilterOption,
  type FilterDate,
} from './filter-bar.js';
export { RowActions, type RowAction } from './row-actions.js';
export { ConfirmDialog } from './confirm-dialog.js';
