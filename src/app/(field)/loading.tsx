import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return (
    <div className="p-4">
      <PageSkeleton rows={4} />
    </div>
  );
}
