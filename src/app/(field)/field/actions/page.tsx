import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";

export default function FieldActionsPage() {
  return (
    <>
      <PageHeader title={t.nav.field.actions} />
      <EmptyState message={t.empty.fieldActions} />
    </>
  );
}
