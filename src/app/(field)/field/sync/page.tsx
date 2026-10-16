import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";

export default function FieldSyncPage() {
  return (
    <>
      <PageHeader title={t.nav.field.sync} />
      <EmptyState message={t.empty.fieldSync} />
    </>
  );
}
