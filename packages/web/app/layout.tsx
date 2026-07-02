import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers.js';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام محاسبة الرسوم المدرسية',
  description: 'System of Record — School Fee Accounting',
  manifest: '/manifest.webmanifest',
};

/**
 * Root layout: Arabic locale, dir="rtl" everywhere (Article IX). Wraps the app
 * in the i18n provider and the TanStack Query provider.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir="rtl">
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
