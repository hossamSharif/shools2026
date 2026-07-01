import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

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

export default withNextIntl(nextConfig);
