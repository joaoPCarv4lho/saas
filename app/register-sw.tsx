'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function RegisterSW() {
  const pathname = usePathname();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  // Client-side route changes never issue a document fetch the SW can
  // observe, so the app-shell cache used for offline reloads (see
  // runtimeCaching in next.config.ts) would otherwise stay empty. Warm it
  // ourselves on every route the user actually visits.
  useEffect(() => {
    if (!('caches' in window) || !navigator.onLine) return;
    fetch(window.location.href, { credentials: 'include' })
      .then((res) => {
        if (res.ok) return caches.open('app-shell').then((c) => c.put('/app-shell', res));
      })
      .then(() => {
        (window as unknown as { __appShellWarmed?: string }).__appShellWarmed = pathname;
      })
      .catch(() => {});
  }, [pathname]);

  return null;
}
