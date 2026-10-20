import { StatusBadge, type Status } from "@/components/ui/badge";
import { t } from "@/i18n/es-AR";
import type { RecordStatus } from "@/lib/office/records";

// blocked = red dot; submitted = pending (dashed); the rest are neutral/valid.
const STATUS_DOT: Record<RecordStatus, Status> = {
  submitted: "pending",
  blocked: "blocked",
  accepted: "valid",
  reviewed: "valid",
  locked: "valid",
};

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  return <StatusBadge status={STATUS_DOT[status]}>{t.records.status[status]}</StatusBadge>;
}
