import { CaptureHub } from "@/components/field/capture-hub";
import { FieldContent } from "@/components/shell/field-action-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";
import { getSession } from "@/lib/session";

// Client-side capture over Dexie: the page is visited online once and served from the SW cache.
export default async function FieldCapturePage() {
  const session = await getSession();
  if (!session.active)
    return (
      <FieldContent>
        <EmptyState message={t.capture.noTypes} />
      </FieldContent>
    );
  return <CaptureHub companyId={session.active.companyId} />;
}
