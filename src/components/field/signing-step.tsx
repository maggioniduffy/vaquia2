"use client";

import { useState } from "react";
import { SignaturePad } from "@/components/field/signature-pad";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/es-AR";
import type { CapturedSignature } from "@/lib/field/capture/draft";
import { formatDateTimeAr } from "@/lib/field/capture/time";

/** One SignaturePad per signer. Generic: the caller decides who signs (persona fields with signature: true). */
export function SigningStep({
  signers,
  signatures,
  onSign,
}: {
  signers: { id: string; name: string }[];
  signatures: Record<string, CapturedSignature>;
  onSign: (personaId: string, png: Blob) => Promise<void>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const done = signers.filter((s) => signatures[s.id]).length;
  if (signers.length === 0) return <p className="text-muted text-sm">{t.capture.sign.none}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-sm">{t.capture.sign.progress(done, signers.length)}</p>
      <ul className="flex flex-col gap-3">
        {signers.map((s) => {
          const sig = signatures[s.id];
          const open = active === s.id;
          return (
            <li
              key={s.id}
              className="border-border flex flex-col gap-3 rounded-[var(--radius-panel)] border p-3"
            >
              <div className="flex min-h-12 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-base">{s.name}</span>
                  {sig ? (
                    <StatusBadge status="valid" className="text-xs">
                      {t.capture.sign.signed(formatDateTimeAr(sig.signed_at))}
                    </StatusBadge>
                  ) : (
                    <StatusBadge status="pending" className="text-xs">
                      {t.capture.sign.pending}
                    </StatusBadge>
                  )}
                </div>
                {!open && (
                  <Button type="button" className="h-12 shrink-0" onClick={() => setActive(s.id)}>
                    {sig ? t.capture.sign.redo : t.capture.sign.sign}
                  </Button>
                )}
              </div>
              {open && (
                <SignaturePad
                  caption={t.capture.sign.caption(s.name, formatDateTimeAr(new Date().toISOString()))}
                  onCancel={() => setActive(null)}
                  onConfirm={async (png) => {
                    await onSign(s.id, png);
                    setActive(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
