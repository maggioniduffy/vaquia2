import Link from "next/link";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { t } from "@/i18n/es-AR";
import { PersonaDetail } from "./persona-detail";

export default async function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <Link
        href="/people"
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon size={14} />
        {t.people.tabs.people}
      </Link>
      <div className="bg-surface border-border overflow-hidden rounded-[var(--radius-panel)] border">
        <PersonaDetail personaId={id} />
      </div>
    </div>
  );
}
