"use client";
import { useEffect } from "react";
import { startSyncTriggers } from "@/lib/sync/trigger";

// Mounted in the authenticated field layout: syncs on app open, when the app becomes visible, when
// the connection returns and when a scheduled retry is due. Renders nothing.
export function SyncRunner() {
  useEffect(() => startSyncTriggers(), []);
  return null;
}
