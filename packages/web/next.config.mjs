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
  // @react-pdf/renderer ships ESM-only; without transpiling it, any bundle
  // that pulls it in (receipt/statement PDF viewers, the statement PDF route
  // handler) fails to compile with "Module not found: ESM packages... need
  // to be imported" — a real bug found while running the Gauntlet E2E specs
  // (no route using it had ever been exercised through a running dev server
  // before this session).
  transpilePackages: ['@erp/shared', '@erp/database', '@erp/ui', '@react-pdf/renderer'],
  experimental: {
    // Server Actions are used for light CRUD (Article VI).
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  // The codebase imports local modules with an explicit `.js` extension
  // (NodeNext/ESM style), which resolves fine for regular server-component
  // webpack builds but NOT for the separate Edge-runtime bundler used to
  // compile middleware.ts — it failed with "Module not found: Can't resolve
  // './lib/supabase/middleware.js'" (a real bug, found while running the
  // Gauntlet E2E specs, since no route had ever been exercised through a
  // running dev server before). extensionAlias tells webpack that a `.js`
  // specifier may also resolve to a `.ts`/`.tsx` file, matching what the
  // TypeScript "Bundler" moduleResolution already does for typechecking.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default withSerwist(withNextIntl(nextConfig));
