"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const EditContext = createContext<(id: string) => void>(() => {});

/**
 * One shared edit sheet per list: row buttons call `openEdit(id)`, the host renders a single
 * sheet for the selected id (so a 500-row list mounts one dialog, not one per row and layout).
 */
export function useEditHost<T extends { id: string }>(items: T[]) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const item = items.find((i) => i.id === id);
  return {
    item,
    open: open && Boolean(item),
    onOpenChange: setOpen,
    openEdit: (next: string) => {
      setId(next);
      setOpen(true);
    },
  };
}

export function EditProvider({
  openEdit,
  children,
}: {
  openEdit: (id: string) => void;
  children: ReactNode;
}) {
  return <EditContext value={openEdit}>{children}</EditContext>;
}

/** Row "Edit" button; same look as the per-row sheet trigger it replaces. */
export function EditButton({ id, label }: { id: string; label: string }) {
  const openEdit = useContext(EditContext);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-12 md:min-h-7"
      onClick={() => openEdit(id)}
    >
      {label}
    </Button>
  );
}
