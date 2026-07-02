'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** T134: registers the installable-shell-only service worker (no offline data layer). */
function useRegisterServiceWorker(): void {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a progressive enhancement — never block the app.
    });
  }, []);
}

/** Client-side providers: TanStack Query (read caching for derived-balance reads). */
export function Providers({ children }: { children: React.ReactNode }) {
  useRegisterServiceWorker();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
