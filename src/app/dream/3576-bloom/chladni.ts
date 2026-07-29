// ─────────────────────────────────────────────────────────────────────────────
// chladni.ts — Canvas2D Chladni-figure renderer driven by live mode energies.
//
// A rectangular plate's out-of-plane displacement is a superposition of standing
// waves over the unit square:
//     u(x,y) = Σ a_i · cos(n_i·π·x) · cos(m_i·π·y)
// Sand thrown off the moving areas piles up on the NODAL LINES, where u ≈ 0.
// We assign each audio mode an integer pair (n_i, m_i) — low modes → low
// integers — and use the engine's current mode energies as the amplitudes a_i.
// So as the sound rings, blooms and the coupling reshuffles energy between modes,
// the visible nodal pattern reorganises in lock-step: the picture IS the sound.
//
// Rendering: compute |u| on a coarse grid into an ImageData, mapping near-zero
// |u| (the nodes) to bright violet filaments and large |u| (antinodes) to a
// dim violet glow, on a near-black field. Drawn small and scaled up for a soft
// bloom. Ref: Ernst Chladni, "Entdeckungen über die Theorie des Klanges" (1787).
// ─────────────────────────────────────────────────────────────────────────────

import { MODE_COUNT } from "./modal";

// (n, m) integer pairs, ordered by n²+m² so audio mode 0 (lowest) maps to the
// simplest figure and higher modes to busier ones. n ≠ m avoids trivial cases.
export const NM_PAIRS: Array<[number, number]> = [
  [1, 2],
  [2, 1],
  [1, 3],
  [2, 3],
  [3, 2],
  [1, 4],
  [3, 4],
  [2, 5],
  [4, 3],
  [3, 5],
  [1, 6],
  [4, 5],
];

const PI = Math.PI;

// Violet ramp (art layer only): near-black field → deep violet glow → bright
// violet-200 filaments on the nodes.
const FIELD: [number, number, number] = [8, 6, 14];
const GLOW: [number, number, number] = [58, 32, 108]; // violet-700-ish antinode wash
const NODE: [number, number, number] = [214, 200, 255]; // violet-200-ish node line

export type ChladniField = {
  buf: number; // grid resolution (buf × buf)
  cosNX: Float32Array; // [mode * buf + x]
  cosMY: Float32Array; // [mode * buf + y]
  img: ImageData | null;
  breath: number; // slow drifting phase for the gentle "breath"
};

export function makeField(buf: number): ChladniField {
  const cosNX = new Float32Array(MODE_COUNT * buf);
  const cosMY = new Float32Array(MODE_COUNT * buf);
  for (let i = 0; i < MODE_COUNT; i++) {
    const [n, m] = NM_PAIRS[i] ?? NM_PAIRS[NM_PAIRS.length - 1];
    for (let p = 0; p < buf; p++) {
      const t = (p + 0.5) / buf; // cell centre in [0,1]
      cosNX[i * buf + p] = Math.cos(n * PI * t);
      cosMY[i * buf + p] = Math.cos(m * PI * t);
    }
  }
  return { buf, cosNX, cosMY, img: null, breath: 0 };
}

/**
 * Render one frame of the Chladni superposition into `ctx`.
 *   energy   — live per-mode amplitudes from the engine
 *   totalE   — total energy (0..~), sets overall brightness
 *   flash    — strike flash 0..1.5, brightens briefly on a hit
 *   strike   — [x,y] strike origin on the unit square, for the ripple ring
 *   tSec     — a monotonic time (s) from rAF, for the breath + ripple
 *   reduced  — prefers-reduced-motion: calmer, dimmer flashing
 */
export function drawChladni(
  ctx: CanvasRenderingContext2D,
  field: ChladniField,
  energy: Float32Array,
  totalE: number,
  flash: number,
  strike: [number, number],
  tSec: number,
  reduced: boolean,
  w: number,
  h: number
) {
  const buf = field.buf;
  if (!field.img || field.img.width !== buf) {
    field.img = ctx.createImageData(buf, buf);
  }
  const img = field.img;
  const data = img.data;

  // amplitudes: sqrt(energy) reads better (energy → amplitude), + floor so a
  // resting plate still shows a faint fundamental figure rather than black.
  const amp = new Float32Array(MODE_COUNT);
  let maxA = 1e-4;
  for (let i = 0; i < MODE_COUNT; i++) {
    const a = Math.sqrt(Math.max(0, energy[i])) + (i === 0 ? 0.06 : 0.0);
    amp[i] = a;
    if (a > maxA) maxA = a;
  }
  // normalise so the pattern stays legible whether loud or nearly silent
  const inv = 1 / maxA;

  // node-line sharpness: tighter (thinner filaments) when energy is high
  const eps = 0.05 + 0.14 / (1 + totalE * 1.5);

  const flashLvl = reduced ? flash * 0.35 : flash;
  const glowBoost = 1 + Math.min(1.4, totalE * 0.35) + flashLvl * 0.6;

  const cosNX = field.cosNX;
  const cosMY = field.cosMY;

  for (let y = 0; y < buf; y++) {
    // precompute per-row cosMY for each mode
    for (let x = 0; x < buf; x++) {
      let u = 0;
      for (let i = 0; i < MODE_COUNT; i++) {
        const a = amp[i] * inv;
        if (a < 0.02) continue;
        u += a * cosNX[i * buf + x] * cosMY[i * buf + y];
      }
      const au = Math.abs(u);
      // node line: bright where |u| ≈ 0
      const node = Math.exp(-(au * au) / (eps * eps));
      // antinode glow: soft where |u| large
      const glow = Math.min(1, au * 0.8) * 0.5;

      const nodeI = node * (0.55 + 0.45 * glowBoost);
      const glowI = glow * glowBoost;

      let r = FIELD[0] + GLOW[0] * glowI + NODE[0] * nodeI;
      let g = FIELD[1] + GLOW[1] * glowI + NODE[1] * nodeI;
      let b = FIELD[2] + GLOW[2] * glowI + NODE[2] * nodeI;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;

      const o = (y * buf + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }

  // Blit small → scaled up (smoothing gives the soft bloom of sand + glow).
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // draw ImageData via a temp path: put onto a scratch then drawImage
  // (createImageData can't be scaled directly, so use a small offscreen).
  const scratch = getScratch(buf);
  scratch.ctx.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(scratch.canvas, 0, 0, buf, buf, 0, 0, w, h);
  ctx.restore();

  // Strike ripple: an expanding faint ring from the strike origin, fading.
  if (!reduced && flash > 0.02) {
    const age = flash; // reuse flash as a proxy for recency (1.5 → 0)
    const cx = strike[0] * w;
    const cy = strike[1] * h;
    const maxR = Math.min(w, h) * 0.55;
    const rr = maxR * (1 - age / 1.5) + 8;
    ctx.save();
    ctx.globalAlpha = Math.min(0.4, age * 0.3);
    ctx.strokeStyle = "rgb(196,181,253)"; // violet-300
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Gentle overall breath (a barely-there vignette pulse), skipped when reduced.
  if (!reduced) {
    field.breath = tSec * 0.25;
    const pulse = 0.5 + 0.5 * Math.sin(field.breath);
    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.min(w, h) * 0.75
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(4,3,8,${0.35 + 0.1 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

// Small offscreen scratch canvas keyed by buffer size (module-level singleton).
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scratchSize = 0;
function getScratch(buf: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!scratchCanvas || scratchSize !== buf) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = buf;
    scratchCanvas.height = buf;
    scratchCtx = scratchCanvas.getContext("2d");
    scratchSize = buf;
  }
  return { canvas: scratchCanvas, ctx: scratchCtx! };
}

export function disposeScratch() {
  scratchCanvas = null;
  scratchCtx = null;
  scratchSize = 0;
}
