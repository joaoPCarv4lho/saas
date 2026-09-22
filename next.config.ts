import type { NextConfig } from "next";
// @ts-expect-error next-pwa lacks type definitions
import withPWA from "next-pwa";
// @ts-expect-error next-pwa lacks type definitions
import defaultCache from "next-pwa/cache.js";

const nextConfig: NextConfig = {};

// All app pages here are client components that fetch their own data on
// mount (see app/comandas/[id]/page.tsx etc). The server-rendered HTML per
// route is just a loading shell, not the real content. Client-side
// navigations (router.push) never issue a plain document fetch for the
// target URL, so the default per-URL NetworkFirst cache never has an entry
// to fall back to on a hard reload while offline. Cache all navigation
// requests under one shared "app-shell" key so any prior successful page
// load can serve a reload of any route while offline; the client then
// re-fetches real data (itself cached by the "apis" rule below) from
// IndexedDB/SW cache to render the correct content.
const runtimeCaching = [
  {
    urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
    handler: "NetworkFirst",
    options: {
      cacheName: "app-shell",
      networkTimeoutSeconds: 10,
      plugins: [
        {
          cacheKeyWillBeUsed: async () => "/app-shell",
        },
      ],
    },
  },
  ...defaultCache,
];

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching,
})(nextConfig);
