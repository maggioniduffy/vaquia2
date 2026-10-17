import type { ReactNode } from "react";
import { AsciiCanvas } from "@/components/landing/ascii-canvas";
import { VaquiaWordmark } from "@/components/ui/brand";
import { t } from "@/i18n/es-AR";
import { TypedWelcome } from "./typed-welcome";

/** Shared class names so auth/onboarding fields and buttons look identical (tokens: .auth-shell in globals.css). */
export const authLabel = "text-[13px] text-[color:var(--a-mu)]";
export const authInput =
  "h-10 rounded-lg border-[color:var(--a-bd)] bg-[var(--a-inp)] px-3 text-[15px] backdrop-blur-[6px] focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--a-ring)]";
export const authHelp = "text-xs text-[color:var(--a-lab)]";
export const authPrimary =
  "h-10 w-full rounded-lg border-accent-strong bg-accent-strong px-4 text-[15px] font-medium text-accent-text hover:border-accent-hover hover:bg-accent-hover";
export const authSecondary =
  "h-10 w-full rounded-lg border-[color:var(--a-bd)] bg-[var(--a-inp)] px-4 text-[15px] font-medium text-text backdrop-blur-[6px] hover:bg-[var(--a-inp)] hover:brightness-95";
export const authGhost = "h-9 w-full rounded-lg px-4 text-sm font-medium";

/**
 * Full-bleed branded background (glow, ASCII mountains, logo-only header, typed welcome)
 * with a 340px form column. Spec: docs/spec/design.md "Auth/onboarding shell".
 */
export function BrandShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-shell bg-bg text-text relative min-h-dvh overflow-hidden">
      <div aria-hidden className="auth-glow absolute inset-0" />
      <div aria-hidden className="auth-ascii absolute bottom-0 left-0 h-[520px] w-full">
        <AsciiCanvas src="/landing/patagonia.png" className="block h-full w-full" />
      </div>
      <header className="absolute inset-x-0 top-0 flex h-[76px] items-center px-5 sm:px-10">
        <VaquiaWordmark size="md" />
      </header>
      <main className="relative flex min-h-dvh flex-col items-center justify-center gap-10 px-4 pt-[110px] pb-[60px]">
        <TypedWelcome text={t.onboarding.welcome} />
        <div className="relative isolate flex w-full max-w-[340px] flex-col gap-5">
          <div aria-hidden className="auth-scrim absolute -inset-x-[120px] -inset-y-[60px] -z-10" />
          <h1 className="text-[36px] leading-[1.1] font-medium tracking-[-0.035em]">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
