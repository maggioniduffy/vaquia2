/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Pages visited online keep working offline: same-origin HTML navigations and RSC payloads are
// served network-first and fall back to the last cached copy. API and auth traffic is never cached
// here (the app talks to /api/sync/* itself and stores results in Dexie).
const fieldPages: RuntimeCaching = {
  matcher: ({ request, sameOrigin, url }) =>
    sameOrigin &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/serwist/") &&
    (request.mode === "navigate" || request.headers.get("RSC") === "1"),
  handler: new NetworkFirst({ cacheName: "field-pages", networkTimeoutSeconds: 4 }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false, // incompatible with a NetworkFirst navigation handler
  runtimeCaching: [fieldPages, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
