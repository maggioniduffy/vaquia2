"use client";
import { useEffect } from "react";
import { refreshReference } from "@/lib/offline/reference";

// Mounted in the field layout (authenticated): refreshes reference data on app open, when the
// connection returns and when the app comes back to the foreground.
export function ReferenceRefresher() {
  useEffect(() => {
    const run = () => void refreshReference();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
