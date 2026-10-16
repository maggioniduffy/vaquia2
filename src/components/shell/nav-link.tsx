"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function NavLink({
  href,
  children,
  className,
  exact = false,
  activeClassName = "text-text font-medium",
}: {
  href: string;
  exact?: boolean;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("text-muted hover:text-text", active && activeClassName, className)}
    >
      {children}
    </Link>
  );
}
