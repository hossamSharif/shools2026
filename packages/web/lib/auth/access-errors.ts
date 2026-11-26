import { getTranslations } from 'next-intl/server';
import { AccessErrorCode } from '@erp/shared/schemas';

/**
 * Maps a Postgres refusal (access-matrix §4 codes, raised by the definer
 * functions with an Arabic hint) to the Arabic `errors.access.*` message.
 * Unknown errors get a generic message; details never reach the screen.
 */
export async function accessErrorMessage(error: { message?: string } | null | undefined): Promise<string> {
  const t = await getTranslations('errors.access');
  const code = error?.message?.match(/^([A-Z_]{4,})/)?.[1];
  const parsed = AccessErrorCode.safeParse(code);
  return parsed.success ? t(parsed.data) : t('generic');
}

/** Throws an Error carrying the Arabic message for a database refusal. */
export async function throwAccessError(error: { message?: string }): Promise<never> {
  throw new Error(await accessErrorMessage(error));
}
