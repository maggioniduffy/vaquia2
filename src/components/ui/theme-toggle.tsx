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
export function ThemeToggle({
  className,
  initial,
  variant = "square",
  label,
}: {
  className?: string;
  initial?: Theme;
  /** `round`: landing nav style (40px circle, 18px icon, CSS-driven icon swap to avoid a flash). */
  variant?: "square" | "round";
  label?: string;
}) {
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
  if (variant === "round") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label ?? (dark ? t.theme.light : t.theme.dark)}
        aria-pressed={dark}
        className={cn(
          "text-text inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-[var(--l-line)] bg-transparent p-0",
          className,
        )}
      >
        <MoonIcon size={18} strokeWidth={1.6} className="lp-moon" />
        <SunIcon size={18} strokeWidth={1.6} className="lp-sun" />
      </button>
    );
  }
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
