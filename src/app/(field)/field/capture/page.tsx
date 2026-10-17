import { FieldContent } from "@/components/shell/field-action-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";

export default function FieldCapturePage() {
  return (
    <FieldContent>
      <EmptyState message={t.field.empty.capture} />
    </FieldContent>
  );
}
