/**
 * Arabic-Indic numeral formatting (Article IX). Uses the ar locale so digits
 * render as ٠١٢٣٤٥٦٧٨٩.
 */
const AR = 'ar';

export function formatNumber(value: number | string, options?: Intl.NumberFormatOptions): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat(AR, options).format(n);
}

/** Format a NUMERIC(14,2) decimal string with two fraction digits, Arabic digits. */
export function formatDecimal(value: string): string {
  return new Intl.NumberFormat(AR, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
