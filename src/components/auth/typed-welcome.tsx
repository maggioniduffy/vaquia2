"use client";

import { useEffect, useState } from "react";

/** Console-style welcome: "> text" typed one char per 85ms with a blinking block cursor. */
export function TypedWelcome({ text }: { text: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setCount(text.length), 0);
      return () => clearTimeout(id);
    }
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 85);
    return () => clearInterval(id);
  }, [text]);

  return (
    <p
      aria-label={text}
      className="text-text flex h-7 items-center font-mono text-[22px] leading-none font-medium"
    >
      <span aria-hidden className="flex items-center">
        <span className="text-accent mr-3">&gt;</span>
        <span>{text.slice(0, count)}</span>
        <span className="auth-cursor bg-accent ml-1 inline-block h-6 w-3" />
      </span>
    </p>
  );
}
