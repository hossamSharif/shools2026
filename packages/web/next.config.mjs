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
  // @react-pdf/renderer ships ESM-only; the client-side receipt viewer
  // (receipt-viewer.tsx, dynamic-imported with ssr:false) needs it transpiled
  // or webpack fails with "Module not found: ESM packages... need to be
  // imported" — a real bug found while running the Gauntlet E2E specs. Next
  // forbids also listing it in experimental.serverComponentsExternalPackages
  // (a "conflict" build error), so the statement PDF route handler's separate
  // "a.Component is not a constructor" issue (its reconciler uses class
  // components, which the "react-server" bundling condition strips) is worked
  // around in that route itself via a genuine `require()` — see
  // app/(school)/students/[studentId]/statement/pdf/route.ts.
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
