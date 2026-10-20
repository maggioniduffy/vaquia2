import { t } from "@/i18n/es-AR";

export const metadata = { title: t.offline.pageTitle };

// Precached by the service worker; shown only for pages never visited online on this device.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{t.offline.title}</h1>
      <p className="text-sm text-[var(--text-muted)]">{t.offline.body}</p>
    </main>
  );
}
