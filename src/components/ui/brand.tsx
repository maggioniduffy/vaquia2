import { useId } from "react";
import { t } from "@/i18n/es-AR";

/** Vaquia mark (120x92). Colors follow the theme via --logo-* tokens (no JS). */
export function VaquiaMark({ size = 20, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg
      height={size}
      width={(size * 120) / 92}
      viewBox="0 0 120 92"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--logo-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-to)" }} />
        </linearGradient>
      </defs>
      <path
        d="M8 4H36Q41 4 43 8L78 64Q80 67 78 71L68 86Q63 93 58 86L4 10Q1 4 8 4Z"
        fill={`url(#${id})`}
      />
      <path
        d="M90 4H114Q120 4 117 9L84 58Q81 62 78 58L71 47Q69 44 71 41L86 7Q87 4 90 4Z"
        style={{ fill: "var(--logo-dark)" }}
      />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 18, text: "text-[18px]", gap: "gap-2" },
  md: { mark: 26, text: "text-[24px]", gap: "gap-2.5" },
} as const;

export function VaquiaWordmark({
  size = "sm",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <VaquiaMark size={s.mark} className="shrink-0" />
      <span className={`${s.text} leading-none font-semibold tracking-[-0.04em]`}>
        {t.app.name}
      </span>
    </span>
  );
}
