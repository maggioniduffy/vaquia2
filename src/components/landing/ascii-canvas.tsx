"use client";

import { useEffect, useRef } from "react";

type Theme = "light" | "dark";

const RAMP = " .,:;-~=+*ixcvzXYJLQ0OZmwqpdbkhao#MW&8%B@";
type RGB = readonly [number, number, number];
const TEAL: RGB = [0, 209, 199];
const MIST: RGB = [238, 242, 245];
const SLATE: RGB = [74, 100, 120];
const NAVY: RGB = [31, 46, 59];
const TEAL_D: RGB = [14, 159, 154];

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Draws the photo "cover"-cropped into a cols×rows buffer (vertical bias `yBias`) and returns its pixels. */
function sample(img: HTMLImageElement, cols: number, rows: number, yBias: number) {
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const o = off.getContext("2d", { willReadFrequently: true })!;
  const ir = img.width / img.height;
  const cr = cols / rows;
  let sw: number, sh: number, sx: number, sy: number;
  if (ir > cr) {
    sh = img.height;
    sw = sh * cr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / cr;
    sx = 0;
    sy = (img.height - sh) * yBias;
  }
  o.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
  return o.getImageData(0, 0, cols, rows).data;
}

/** Linear mix a→b by f (unrounded unless `round`). */
function mix(a: RGB, b: RGB, f: number, round = false): RGB {
  const m = (k: 0 | 1 | 2) => {
    const v = a[k] + (b[k] - a[k]) * f;
    return round ? Math.round(v) : v;
  };
  return [m(0), m(1), m(2)];
}

function render(
  img: HTMLImageElement,
  theme: Theme,
  family: string,
  dpr: number,
  W: number,
  H: number,
) {
  const light = theme === "light";
  const cv = document.createElement("canvas");
  cv.width = W * dpr;
  cv.height = H * dpr;
  const ctx = cv.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.font = `500 9px ${family}`;
  ctx.textBaseline = "top";
  const cw = ctx.measureText("M").width || 5.4;
  const ch = 10;
  const cols = Math.floor(W / cw);
  const rows = Math.ceil(H / ch);
  const d = sample(img, cols, rows, 0.6);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const px: RGB = [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0];
      const lum = (0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]) / 255;
      const l = light ? 1 - lum : lum;
      const c0 = RAMP.charAt(Math.min(RAMP.length - 1, Math.floor(l * RAMP.length)));
      if (c0 === " ") continue;
      let c: RGB;
      let a: number;
      if (light) {
        c = mix(TEAL_D, NAVY, l, true);
        a = 0.25 + l * 0.65;
      } else {
        const t = l < 0.55 ? mix(SLATE, TEAL, l / 0.55) : mix(TEAL, MIST, (l - 0.55) / 0.45);
        c = [
          Math.round(t[0] * 0.7 + px[0] * 0.3),
          Math.round(t[1] * 0.7 + px[1] * 0.3),
          Math.round(t[2] * 0.7 + px[2] * 0.3),
        ];
        a = 0.35 + l * 0.6;
      }
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(2)})`;
      ctx.fillText(c0, x * cw, y * ch);
    }
  }
  return cv;
}

/**
 * Decorative ASCII rendering of the hero photo, sized to the canvas box (full viewport width).
 * Rendered once per theme × size and cached; redrawn on theme change and (debounced) resize.
 */
export function AsciiCanvas({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    let img: HTMLImageElement | null = null;
    const cache = new Map<string, HTMLCanvasElement>();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const family =
      getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() ||
      "monospace";

    function draw() {
      if (!alive || !img || !canvas) return;
      const W = Math.max(1, Math.round(canvas.clientWidth));
      const H = Math.max(1, Math.round(canvas.clientHeight));
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      const theme = currentTheme();
      const key = `${theme}:${W}x${H}`;
      let cached = cache.get(key);
      if (!cached) {
        cached = render(img, theme, `${family}, monospace`, dpr, W, H);
        cache.set(key, cached);
      }
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(cached, 0, 0);
    }

    const image = new Image();
    const loaded = new Promise<void>((resolve) => {
      image.onload = () => resolve();
    });
    image.src = src;
    Promise.all([
      loaded,
      document.fonts
        ? document.fonts.load(`500 9px ${family}`).then(() => document.fonts.ready)
        : Promise.resolve(),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        img = image;
        draw();
      });

    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(draw, 150);
    });
    ro.observe(canvas);
    return () => {
      alive = false;
      clearTimeout(timer);
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", draw);
    };
  }, [src]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
