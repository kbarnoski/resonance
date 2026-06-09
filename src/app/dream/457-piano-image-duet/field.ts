// ─────────────────────────────────────────────────────────────────────────────
// field.ts — Synthesized latent field for "457 Piano Image Duet".
// Used as the NO-KEY fallback: when no FAL_KEY, this generates a plasma /
// drifting gradient blob canvas driven by the musical frame, and the
// image-as-score scanner runs over IT — so the piece is complete and
// beautiful with zero API calls.
//
// Public API:
//   initField(canvas) → FieldRenderer
//   renderer.drawField(frame, now, dt)       → renders plasma + blobs
//   renderer.readColumn(normX)               → ImageData column for scanner
//   renderer.addBloom(x, y, hue)
//   renderer.destroy()
// ─────────────────────────────────────────────────────────────────────────────

import type { MusicalFrame } from "./analysis";

const PC_HUE: readonly number[] = [
  150, 185, 200, 260, 280, 340, 20, 40, 80, 220, 300, 240,
];

interface BloomPulse {
  x: number; y: number;
  age: number;
  maxAge: number;
  hue: number;
}

export interface FieldRenderer {
  drawField: (frame: MusicalFrame, now: number, dt: number) => void;
  /** Return an ImageData snapshot of the current canvas (for scanner sampling) */
  readImageData: () => ImageData | null;
  addBloom: (x: number, y: number, hue: number) => void;
  destroy: () => void;
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2 = (pp: number, qq: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
      if (t < 0.5) return qq;
      if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
      return pp;
    };
    r = hue2(p, q, h + 1 / 3);
    g = hue2(p, q, h);
    b = hue2(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function initField(canvas: HTMLCanvasElement): FieldRenderer {
  const ctxOrNull = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctxOrNull) throw new Error("no 2d context");
  // After the null-check we assign to a typed const so TypeScript is happy in closures
  const ctx: CanvasRenderingContext2D = ctxOrNull

  // Off-screen low-res plasma canvas
  const offCanvas = document.createElement("canvas");
  const offCtx = offCanvas.getContext("2d")!;
  let offW = 0, offH = 0;

  const blooms: BloomPulse[] = [];

  function ensureSize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(canvas.clientWidth * dpr);
    const H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W || 1;
      canvas.height = H || 1;
    }
    if (offW !== canvas.width || offH !== canvas.height) {
      offCanvas.width = Math.max(1, Math.floor(canvas.width / 5));
      offCanvas.height = Math.max(1, Math.floor(canvas.height / 5));
      offW = canvas.width;
      offH = canvas.height;
    }
  }

  function drawField(frame: MusicalFrame, now: number, dt: number): void {
    ensureSize();
    const W = canvas.width, H = canvas.height;
    if (W === 0 || H === 0) return;

    const { rms, dominantPc, modality, consonance } = frame;
    const hue = PC_HUE[dominantPc] ?? 220;
    const t = now / 1000;

    const hue2 = (hue + 60) % 360;
    const hue3 = (hue + 200) % 360;
    const satBoost = 20 + consonance * 30;
    const speed = 0.15 + Math.max(0, rms) * 0.5;
    const hueOffset = modality === "major" ? 0 : 40;

    // ── Plasma (offscreen low-res) ────────────────────────────────────────
    const OW = offCanvas.width, OH = offCanvas.height;
    const imgData = offCtx.createImageData(OW, OH);
    const d = imgData.data;

    for (let py = 0; py < OH; py++) {
      for (let px = 0; px < OW; px++) {
        const nx = px / OW, ny = py / OH;
        const v1 = Math.sin(nx * 9 + t * speed * 1.7 + rms * 3);
        const v2 = Math.sin(ny * 7 - t * speed * 1.4 + rms * 2);
        const v3 = Math.sin((nx + ny) * 6 + t * speed * 1.1);
        const v4 = Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 14 - t * speed * 2.3);
        const v = (v1 + v2 + v3 + v4) / 4;
        const baseH = (hue + hueOffset + v * 45 * (0.5 + rms) + 360) % 360;
        const s = (40 + satBoost + rms * 10) / 100;
        const l = (8 + (v * 0.5 + 0.5) * 18 + rms * 10) / 100;
        const [r, g, b] = hsl2rgb(baseH / 360, s, l);
        const idx = (py * OW + px) * 4;
        d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(offCanvas, 0, 0, W, H);
    ctx.restore();

    // ── Orbiting volumetric blobs ─────────────────────────────────────────
    const blobHues = [hue, hue2, hue3];
    for (let bi = 0; bi < 3; bi++) {
      const phase = t * (0.08 + bi * 0.035) + bi * 2.1;
      const bx = W * (0.5 + Math.sin(phase) * 0.3);
      const by = H * (0.5 + Math.cos(phase * 1.4) * 0.24);
      const bRad = W * (0.22 + rms * 0.22 + Math.sin(phase * 2.2) * 0.04);
      const sat = 55 + satBoost * 0.5;
      const lit = 28 + rms * 28;
      const alpha = 0.12 + consonance * 0.10 + rms * 0.08;
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, bRad);
      rg.addColorStop(0, `hsla(${blobHues[bi]}, ${sat}%, ${lit}%, ${alpha})`);
      rg.addColorStop(0.5, `hsla(${blobHues[bi]}, ${sat}%, ${lit * 0.55}%, ${alpha * 0.35})`);
      rg.addColorStop(1, `hsla(${blobHues[bi]}, ${sat}%, ${lit * 0.25}%, 0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Bloom overlays ────────────────────────────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i];
      b.age += dt;
      if (b.age > b.maxAge) { blooms.splice(i, 1); continue; }
      const tp = b.age / b.maxAge;
      const alpha = Math.sin(tp * Math.PI) * 0.55;
      const radius = W * (0.04 + tp * 0.18);
      const rg2 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
      rg2.addColorStop(0, `hsla(${b.hue}, 80%, 80%, ${alpha})`);
      rg2.addColorStop(0.4, `hsla(${b.hue}, 70%, 65%, ${alpha * 0.5})`);
      rg2.addColorStop(1, `hsla(${b.hue}, 60%, 50%, 0)`);
      ctx.fillStyle = rg2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── Vignette ──────────────────────────────────────────────────────────
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.82);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function readImageData(): ImageData | null {
    const W = canvas.width, H = canvas.height;
    if (W === 0 || H === 0) return null;
    try {
      return ctx.getImageData(0, 0, W, H);
    } catch { return null; }
  }

  function addBloom(x: number, y: number, hue: number): void {
    blooms.push({ x, y, age: 0, maxAge: 1.2, hue });
    if (blooms.length > 20) blooms.shift();
  }

  function destroy(): void {
    blooms.length = 0;
  }

  return { drawField, readImageData, addBloom, destroy };
}
