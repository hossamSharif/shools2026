import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// This declares the value of `injectionPoint` in next.config.mjs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/**
 * T134 — Installable-only PWA service worker (Article VI/plan.md constraint:
 * no offline data layer for money records — every read/write of financial
 * data must hit Supabase live; Serwist here only precaches the static app
 * shell so the app is installable and boots offline to a "you're offline"
 * state, never stale/cached money data).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Serwist's default Next.js cache strategy set: static shell assets
  // (JS/CSS/fonts/images/precompiled pages) only. It does not match
  // Supabase REST/RPC calls (a different origin) or dynamic /app route data,
  // so financial reads always hit the network live — no offline data layer.
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
