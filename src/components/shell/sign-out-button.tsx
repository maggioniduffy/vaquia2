"use client";

import { t } from "@/i18n/es-AR";
import { signOut } from "@/lib/actions/auth";

// Every company this device holds local data for; companies with unsynced items are kept.
// Dexie and the sync code load on click only, so office pages don't ship them for this button.
async function cleanupLocalData() {
  try {
    const [{ getDb }, { cleanupOnSignOut }] = await Promise.all([
      import("@/lib/offline/db"),
      import("@/lib/sync/outbox"),
    ]);
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
