import { PageTitle } from "@/components/people/page-title";
import { t } from "@/i18n/es-AR";
import { getSession } from "@/lib/session";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const session = await getSession();
  const role = session.active?.role;
  const allowed = role === "hse" || role === "admin";
  if (!allowed) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title={t.import.title} />
        <p className="text-muted text-sm">{t.import.forbidden}</p>
      </div>
    );
  }
  return <ImportForm />;
}
