/**
 * Numeral formatting. Uses Western (Latin) digits 0123456789 while keeping the
 * app's locale layout. 'en-US' renders Western digits with standard grouping
 * (comma) and decimal (period) separators.
 */
const LOCALE = 'en-US';

export function formatNumber(value: number | string, options?: Intl.NumberFormatOptions): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat(LOCALE, options).format(n);
}

/** Format a NUMERIC(14,2) decimal string with two fraction digits, Western digits. */
export function formatDecimal(value: string): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
