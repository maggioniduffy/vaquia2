"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { MoonIcon, SunIcon } from "./icons";

type Theme = "light" | "dark";

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 32×32 bordered icon button. Cycles light ↔ dark; persists in the `theme` cookie (1 year). */
export function ThemeToggle({ className, initial }: { className?: string; initial?: Theme }) {
  const [theme, setTheme] = useState<Theme | null>(initial ?? null);

  useEffect(() => {
    // Resolve the effective theme after mount (system preference is client-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current());
  }, []);

  function toggle() {
    const next: Theme = (theme ?? current()) === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t.theme.light : t.theme.dark}
      aria-pressed={dark}
      title={dark ? t.theme.light : t.theme.dark}
      className={cn(
        "border-border text-text hover:bg-hover inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] border transition-colors",
        className,
      )}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
