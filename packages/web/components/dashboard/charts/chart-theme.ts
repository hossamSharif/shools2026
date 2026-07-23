/**
 * Shared chart theme for the dashboard charts (Recharts, RTL/Arabic).
 * Colors mirror the "Nile teal" semantic tokens in packages/ui/tailwind.config.ts
 * so charts stay on-brand alongside the KPI cards.
 */

export const CHART_COLORS = {
  primary: '#0E6E66',
  success: '#1F9254',
  warning: '#B7791F',
  danger: '#C0392B',
  info: '#2B6CB0',
  border: '#E5E1D8',
  muted: '#6B6558',
} as const;

/** Categorical series palette for multi-bar / multi-account charts. */
export const CHART_SERIES = [
  CHART_COLORS.primary,
  CHART_COLORS.info,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
];

/** Recharts mount animation defaults (shared so all charts feel consistent). */
export const CHART_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: 'ease-out' as const,
};

/** Tick style for axes — small, muted, Arabic font inherited from the page. */
export const AXIS_TICK = { fontSize: 12, fill: CHART_COLORS.muted };
