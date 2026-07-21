import type { MetadataRoute } from 'next';

/**
 * T134 — PWA manifest for an installable-only app shell (no offline data
 * layer; Serwist only precaches the shell so the app can be added to the
 * home screen — money data always requires a live network round-trip).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'نظام محاسبة الرسوم المدرسية',
    short_name: 'محاسبة الرسوم',
    description: 'System of Record — School Fee Accounting',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    dir: 'rtl',
    lang: 'ar',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    // Static PNGs under public/icons (a graduation-cap mark on the theme
    // field). The glyph is padded to a maskable safe area, so the same asset
    // serves both the plain ('any') and adaptive/round ('maskable') slots —
    // declared separately because Next's Manifest type rejects the
    // space-separated "any maskable" the web spec otherwise allows.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
