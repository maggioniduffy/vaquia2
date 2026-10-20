"use client";
import { runSync, type RunResult } from "./runner";

// When to run the sync. Background Sync (Android Chrome) wakes the service worker even with the app
// closed; iOS has no Background Sync, so the page also syncs on startup, when it becomes visible
// again, on `online`, and when the earliest scheduled retry is due (spec: architecture.md#Offline sync).

export const SYNC_TAG = "vaquia-sync";
const MIN_TIMER_MS = 1_000;
const MAX_TIMER_MS = 15 * 60_000;

/** Registers a one-off Background Sync where supported; silently a no-op elsewhere. */
export async function requestBackgroundSync(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    if (!sync) return false;
    await sync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/** Call right after enqueueing: syncs now if online and arms Background Sync as the safety net. */
export function notifyEnqueued(): void {
  void requestBackgroundSync();
  void runSync().catch(() => {});
}

/** Starts page-level triggers; returns the cleanup. Mount once in the authenticated field layout. */
export function startSyncTriggers(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const run = async (ignoreBackoff = false) => {
    if (stopped) return;
    let result: RunResult | undefined;
    try {
      result = await runSync({ ignoreBackoff });
    } catch {
      return; // storage unavailable; the next trigger tries again
    }
    schedule(result.nextAttemptAt);
  };

  const schedule = (nextAttemptAt: string | null) => {
    clearTimeout(timer);
    if (!nextAttemptAt || stopped) return;
    const wait = Math.min(MAX_TIMER_MS, Math.max(MIN_TIMER_MS, Date.parse(nextAttemptAt) - Date.now()));
    timer = setTimeout(() => void run(), wait);
  };

  const onOnline = () => void run(true);
  const onVisible = () => {
    if (document.visibilityState === "visible") void run();
  };
  void run();
  void requestBackgroundSync();
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
