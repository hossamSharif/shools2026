import { formatInTimeZone } from 'date-fns-tz';
import { ar } from 'date-fns/locale';

/**
 * Dates are stored UTC and rendered in Africa/Khartoum with Arabic locale
 * (Article VIII/IX). Pass a UTC ISO string or Date.
 */
export const SCHOOL_TZ = 'Africa/Khartoum';

export function formatDate(value: string | Date, pattern = 'yyyy/MM/dd'): string {
  return formatInTimeZone(value, SCHOOL_TZ, pattern, { locale: ar });
}

export function formatDateTime(value: string | Date, pattern = 'yyyy/MM/dd HH:mm'): string {
  return formatInTimeZone(value, SCHOOL_TZ, pattern, { locale: ar });
}
