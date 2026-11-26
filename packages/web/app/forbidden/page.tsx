import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAuth } from '../../lib/auth/guard.js';

/**
 * Shown when a signed-in user opens a page their permissions do not allow
 * (requirePermission → /forbidden, US3-2). The data layer refuses on its own;
 * this page only explains it in Arabic.
 */
export default async function ForbiddenPage() {
  await requireAuth();
  const t = await getTranslations('forbidden');
  return (
    <main
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <p className="text-5xl font-bold text-muted-foreground" aria-hidden>
        403
      </p>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('body')}</p>
      <Link href="/" className="text-blue-600 hover:underline">
        {t('home')}
      </Link>
    </main>
  );
}
