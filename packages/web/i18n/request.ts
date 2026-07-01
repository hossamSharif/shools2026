import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl request config. The app is Arabic-only (Article IX): a single
 * locale, RTL throughout. Messages load from ./messages/ar.json.
 */
export const LOCALE = 'ar' as const;

export default getRequestConfig(async () => {
  return {
    locale: LOCALE,
    messages: (await import('./messages/ar.json')).default,
    timeZone: 'Africa/Khartoum',
  };
});
