import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// T134: installable-only PWA — precaches the static shell only, no offline
// data layer for money records (see app/sw.ts).
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@erp/shared', '@erp/database', '@erp/ui'],
  experimental: {
    // Server Actions are used for light CRUD (Article VI).
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default withSerwist(withNextIntl(nextConfig));
