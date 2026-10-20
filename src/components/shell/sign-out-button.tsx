"use client";

import { t } from "@/i18n/es-AR";
import { signOut } from "@/lib/actions/auth";
import { getDb } from "@/lib/offline/db";
import { cleanupOnSignOut } from "@/lib/sync/outbox";

// Every company this device holds local data for; companies with unsynced items are kept.
async function cleanupLocalData() {
  try {
    const db = getDb();
    const ids = new Set<string>();
    for (const table of [db.drafts, db.blobs, db.reference, db.outbox]) {
      for (const id of await table.orderBy("company_id").uniqueKeys()) ids.add(String(id));
    }
    await cleanupOnSignOut([...ids], db);
  } catch {
    // Local cleanup is best effort: never block signing out.
  }
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form
      action={async () => {
        await cleanupLocalData();
        await signOut();
      }}
    >
      <button type="submit" className={className ?? "text-muted hover:text-text text-sm"}>
        {t.auth.signOut}
      </button>
    </form>
  );
}
