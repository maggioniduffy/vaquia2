"use client";

import { Toast as T } from "radix-ui";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/components/ui/badge";
import { CheckIcon } from "@/components/ui/icons";

/** "success" is an alias of "neutral" (no green in the system): neutral border + check icon. */
type ToastTone = Tone | "success";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction };
type ToastFn = (message: string, tone?: ToastTone, action?: ToastAction) => void;

const ToastContext = createContext<ToastFn | null>(null);

const border: Record<ToastTone, string> = {
  neutral: "",
  success: "",
  danger: "border-l-danger border-l-2",
  warning: "border-l-warning border-l-2",
};

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastFn>((message, tone = "neutral", action) => {
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), message, tone, action }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <T.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <T.Root
            key={item.id}
            onOpenChange={(open) => {
              if (!open) setItems((prev) => prev.filter((i) => i.id !== item.id));
            }}
            className={cn(
              "border-border bg-surface flex items-center gap-3 rounded-[var(--radius-panel)] border px-4 py-3 text-sm shadow-[var(--shadow-toast)]",
              border[item.tone],
            )}
          >
            {item.tone === "neutral" || item.tone === "success" ? (
              <CheckIcon size={16} className="text-muted shrink-0" />
            ) : null}
            <T.Description className="flex-1">{item.message}</T.Description>
            {item.action ? (
              <T.Action altText={item.action.label} asChild>
                <button
                  type="button"
                  onClick={item.action.onClick}
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  {item.action.label}
                </button>
              </T.Action>
            ) : null}
          </T.Root>
        ))}
        <T.Viewport className="fixed right-4 bottom-4 z-50 flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2 md:bottom-4" />
      </T.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}
