"use client";

import { Toast as T } from "radix-ui";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/components/ui/badge";

type ToastItem = { id: number; message: string; tone: Tone };
type ToastFn = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ToastFn | null>(null);

const border: Record<Tone, string> = {
  neutral: "border-l-border",
  danger: "border-l-danger",
  warning: "border-l-warning",
  success: "border-l-success",
};

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastFn>((message, tone = "neutral") => {
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), message, tone }]);
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
              "border-border bg-bg rounded-[var(--radius-panel)] border border-l-2 px-4 py-3 text-sm shadow-lg",
              border[item.tone],
            )}
          >
            <T.Description>{item.message}</T.Description>
          </T.Root>
        ))}
        <T.Viewport className="fixed right-4 bottom-20 z-50 flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2 md:bottom-4" />
      </T.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}
