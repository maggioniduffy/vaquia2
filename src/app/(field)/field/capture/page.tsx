import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";

export default function FieldCapturePage() {
  return (
    <>
      <PageHeader title={t.nav.field.capture} />
      <EmptyState message={t.empty.fieldCapture} />
    </>
  );
}
