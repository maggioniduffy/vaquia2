"use client";
import { useCallback, useEffect, useState } from "react";

// Capture is a single URL (`/field/capture`) so the service worker's cached copy always matches,
// online or offline. The open draft lives in the hash: `#/<draftId>`; no hash = the hub list.

const read = () =>
  typeof window === "undefined" ? null : window.location.hash.replace(/^#\/?/, "") || null;

export function useCaptureRoute(): {
  draftId: string | null;
  open: (draftId: string | null, opts?: { replace?: boolean }) => void;
} {
  const [draftId, setDraftId] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setDraftId(read());
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
    setDraftId(id);
  }, []);
  return { draftId, open };
}
