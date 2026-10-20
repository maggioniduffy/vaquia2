"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

// Registers the service worker (served by src/app/serwist/[path]/route.ts). Disabled in dev, where
// Turbopack's HMR and a caching worker fight each other.
export function OfflineProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"}>
      {children}
    </SerwistProvider>
  );
}
