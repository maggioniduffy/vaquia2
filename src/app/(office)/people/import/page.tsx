import { PageHeader } from "@/components/shell/page-header";
import { t } from "@/i18n/es-AR";
import { getSession } from "@/lib/session";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const session = await getSession();
  const role = session.active?.role;
  const allowed = role === "hse" || role === "admin";
  return (
    <>
      <PageHeader title={t.import.title} />
      {allowed ? <ImportForm /> : <p className="text-muted text-sm">{t.import.forbidden}</p>}
    </>
  );
}
