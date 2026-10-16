import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title={t.nav.office.settings} />
      <EmptyState message={t.empty.settings} />
    </>
  );
}
