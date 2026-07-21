import type { Metadata } from 'next';
import { Tajawal } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers.js';
import './globals.css';

// The `--font-arabic` CSS var (globals.css/tailwind preset) previously had no
// actual font behind it — it silently fell back to system-ui. This loads the
// real Tajawal webfont and feeds it into that same var.
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: 'نظام محاسبة الرسوم المدرسية',
  description: 'System of Record — School Fee Accounting',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/icons/apple-icon-180.png',
  },
};

/**
 * Root layout: Arabic locale, dir="rtl" everywhere (Article IX). Wraps the app
 * in the i18n provider and the TanStack Query provider.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir="rtl" className={tajawal.variable}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
