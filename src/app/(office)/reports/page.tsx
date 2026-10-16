import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title={t.nav.office.reports} />
      <EmptyState message={t.empty.reports} />
    </>
  );
}
