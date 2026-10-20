"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import { canvasToSignaturePng } from "@/lib/field/capture/png";

const HEIGHT = 140;

/**
 * SignaturePad (design.md): 140px, dashed border, radius 6, signer + time caption.
 * Finger/pen drawing on a canvas; confirm exports a PNG of at most 200 KB.
 */
export function SignaturePad({
  caption,
  onConfirm,
  onCancel,
}: {
  caption: string;
  onConfirm: (png: Blob) => void | Promise<void>;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2.5 * (canvas.width / canvas.clientWidth || 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setInked(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.round(HEIGHT * scale);
    reset();
  }, [reset]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y); // a tap leaves a dot
    ctx.stroke();
    setInked(true);
    setError(null);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    drawing.current = false;
  };

  const confirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !inked) return setError(t.capture.sign.empty);
    setBusy(true);
    try {
      await onConfirm(await canvasToSignaturePng(canvas));
    } catch {
      setError(t.capture.sign.failed);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        aria-label={t.capture.sign.hint}
        className="border-border w-full touch-none rounded-[var(--radius-control)] border border-dashed bg-white"
        style={{ height: HEIGHT }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <p className="text-muted font-mono text-xs">{caption}</p>
      {error && <FieldError>{error}</FieldError>}
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" className="h-12" onClick={onCancel} disabled={busy}>
          {t.capture.sign.cancel}
        </Button>
        <Button type="button" className="h-12" onClick={reset} disabled={busy || !inked}>
          {t.capture.sign.clear}
        </Button>
        <Button type="button" variant="primary" className="h-12" onClick={confirm} disabled={busy}>
          {t.capture.sign.confirm}
        </Button>
      </div>
    </div>
  );
}
