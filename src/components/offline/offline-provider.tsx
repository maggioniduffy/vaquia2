"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

// Registers the service worker (served by src/app/serwist/[path]/route.ts). Disabled in dev, where
// Turbopack's HMR and a caching worker fight each other. `cacheOnNavigation` is off: it re-fetched
// every pushState/replaceState URL as a full HTML render (a second server render per click, office
// included); field pages are cached by FieldPageCache instead. `reloadOnOnline` is off so a flaky
// connection never reloads the page mid-capture.
export function OfflineProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== "production"}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
