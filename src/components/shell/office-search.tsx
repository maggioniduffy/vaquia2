"use client";

import Form from "next/form";
import { useEffect, useRef } from "react";
import { SearchIcon } from "@/components/ui/icons";
import { t } from "@/i18n/es-AR";

/** Header search. Ctrl/⌘K focuses it; submits to the people list until a global search exists. */
export function OfficeSearch() {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Form action="/people" role="search" className="hidden min-w-0 flex-1 md:block">
      <label className="border-border bg-surface text-muted focus-within:border-accent mx-auto flex h-9 max-w-xl items-center gap-2 rounded-[var(--radius-control)] border px-3 focus-within:shadow-[0_0_0_3px_var(--accent-subtle)]">
        <SearchIcon size={18} className="shrink-0" />
        <input
          ref={input}
          type="search"
          name="q"
          maxLength={100}
          aria-label={t.officeShell.searchLabel}
          placeholder={t.officeShell.searchPlaceholder}
          className="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent outline-none"
        />
        <kbd className="hidden shrink-0 font-mono text-xs lg:inline">
          {t.officeShell.searchShortcut}
        </kbd>
      </label>
    </Form>
  );
}
