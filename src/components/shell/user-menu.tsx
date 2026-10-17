"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/es-AR";
import { SignOutButton } from "./sign-out-button";

/** Header user chip; opens a small menu with the field view link and sign out. */
export function UserMenu({
  name,
  initials,
  role,
}: {
  name: string;
  initials: string;
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "hover:bg-hover flex h-9 w-full items-center rounded-[var(--radius-control)] px-3 text-left";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={t.officeShell.userMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="border-border hover:bg-hover flex h-10 items-center gap-2.5 rounded-[var(--radius-control)] border px-1.5 lg:pr-3"
      >
        <span
          aria-hidden
          className="border-border bg-surface flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
        >
          {initials}
        </span>
        <span className="hidden flex-col text-left leading-tight lg:flex">
          <span className="font-medium">{name}</span>
          {role ? <span className="text-muted text-xs">{role}</span> : null}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="border-border bg-surface absolute top-full right-0 z-20 mt-2 flex w-48 flex-col gap-0.5 rounded-[var(--radius-panel)] border p-1 shadow-[0_8px_24px_rgba(0,0,0,.12)]"
        >
          <Link href="/field" role="menuitem" className={item} onClick={() => setOpen(false)}>
            {t.nav.toField}
          </Link>
          <SignOutButton className={`${item} text-text`} />
        </div>
      ) : null}
    </div>
  );
}
