"use client";
import { useCallback, useEffect, useState } from "react";

// Capture is a single URL (`/field/capture`) so the service worker's cached copy always matches,
// online or offline. The open draft lives in the hash: `#/<draftId>`; no hash = the hub list.
// `#/new/<recordTypeCode>` (deep link from the field home) starts a new draft of that type; the hub
// replaces it with `#/<draftId>`. The pathname and query never change.

const read = () =>
  typeof window === "undefined" ? null : window.location.hash.replace(/^#\/?/, "") || null;

const NEW = /^new\/([a-z][a-z0-9_]*)$/;

export function useCaptureRoute(): {
  draftId: string | null;
  /** Record type code of a pending `#/new/<code>` deep link. */
  newType: string | null;
  open: (draftId: string | null, opts?: { replace?: boolean }) => void;
} {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setHash(read());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const open = useCallback((id: string | null, opts?: { replace?: boolean }) => {
    const url = `${window.location.pathname}${window.location.search}${id ? `#/${id}` : ""}`;
    if (opts?.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setHash(id);
  }, []);
  const newType = hash ? (NEW.exec(hash)?.[1] ?? null) : null;
  return { draftId: newType ? null : hash, newType, open };
}
