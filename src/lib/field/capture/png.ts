import { MAX_SIGNATURE_BYTES } from "@/lib/sync/envelope";
import { sha256Hex } from "@/lib/sync/canonical";

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Exports a signature canvas as PNG of at most 200 KB (the server rejects larger blobs).
 * Downscales by 25% per attempt until it fits; throws if even a tiny canvas does not.
 */
export async function canvasToSignaturePng(source: HTMLCanvasElement): Promise<Blob> {
  let canvas = source;
  for (let attempt = 0; attempt < 8; attempt++) {
    const blob = await toBlob(canvas);
    if (!blob) throw new Error("canvas export failed");
    if (blob.size <= MAX_SIGNATURE_BYTES) return blob;
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.floor(canvas.width * 0.75));
    next.height = Math.max(1, Math.floor(canvas.height * 0.75));
    const ctx = next.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }
  throw new Error("signature too large");
}

export async function sha256Blob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}
