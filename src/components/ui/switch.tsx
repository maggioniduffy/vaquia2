"use client";

import { Switch as S } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** 32×18 switch. On = accent track, off = border track. */
export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "border-border bg-hover data-[state=checked]:border-accent data-[state=checked]:bg-accent inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <S.Thumb className="bg-surface data-[state=checked]:bg-accent-text block size-3 translate-x-[2px] rounded-full transition-transform data-[state=checked]:translate-x-[16px]" />
    </S.Root>
  );
}
