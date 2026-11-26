import { getTranslations } from 'next-intl/server';
import { AcceptInviteForm } from '../../../components/auth/accept-invite-form.js';

/**
 * Public accept-invite page (spec 002, T059). An authentication flow like
 * /login (Article XVII): no tenant data is read here; the token is validated
 * only by the worker + database. `/auth` is in the middleware's public paths.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const t = await getTranslations('invite');
  const token = searchParams.token ?? '';
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">{t('acceptTitle')}</h1>
      {valid ? (
        <AcceptInviteForm token={token} />
      ) : (
        <p role="alert" className="max-w-sm text-center text-sm text-red-600">
          {t('invalid')}
        </p>
      )}
    </main>
  );
}
