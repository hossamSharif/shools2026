import { formatDecimal } from './number.js';

/**
 * SDG is the only currency (Article IX). We render the amount with Arabic digits
 * and the ج.س suffix rather than Intl currency (which would use "SDG"/"ج.س.‏"
 * inconsistently across runtimes).
 */
export const CURRENCY_SUFFIX = 'ج.س';

/** Format a NUMERIC(14,2) decimal string as an SDG amount, e.g. "١٬٢٥٠٫٠٠ ج.س". */
export function formatCurrency(value: string): string {
  return `${formatDecimal(value)} ${CURRENCY_SUFFIX}`;
}
