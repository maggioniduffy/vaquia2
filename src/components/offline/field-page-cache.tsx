"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Asks the service worker to cache each field page's HTML once per session, so a page reached by
// client-side navigation still loads offline after a reload. Scoped to /field: office navigations
// no longer pay for a second server render. The hub's main screens are warmed on first mount so
// they open offline even if not visited yet this session.
const FIELD_ROUTES = ["/field", "/field/capture", "/field/sync", "/field/actions"];
const cached = new Set<string>();

export function FieldPageCache() {
  const pathname = usePathname();
  useEffect(() => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw || !navigator.onLine) return;
    const urls = [pathname, ...FIELD_ROUTES].filter((url) => !cached.has(url));
    if (urls.length === 0) return;
    for (const url of urls) cached.add(url);
    sw.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: urls } });
  }, [pathname]);
  return null;
}
