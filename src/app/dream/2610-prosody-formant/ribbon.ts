// ─────────────────────────────────────────────────────────────────────────────
// ribbon.ts — SVG geometry for the scrolling prosody + formant ribbon.
//
//   Builds path strings from a ring buffer of analysed Frames:
//     • the f0 line as a SPINE, with loudness → thickness (a filled ribbon),
//     • the spectral envelope as STACKED colour strata beneath the spine
//       (formant bands along a violet → magenta ramp) so you literally SEE
//       vowel colour shift,
//     • a "WORDS · DISCARDED" redaction stream (recycled glyph blocks).
//
//   Pure geometry only — no DOM. The page renders the returned strings/objects
//   as a small, capped set of SVG nodes.
// ─────────────────────────────────────────────────────────────────────────────

import { BAND_COUNT, type Frame } from "./prosody";

export const VIEW_W = 1000;
export const VIEW_H = 420;

// Vertical layout inside the viewBox.
const SPINE_TOP = 70; // highest f0 sits here
const SPINE_BOT = 220; // lowest f0 sits here
const STRATA_TOP = 250; // colour strata grow up from the baseline
const STRATA_BASE = 400;
const STRATA_SPAN = STRATA_BASE - STRATA_TOP;

const F0_LOG_MIN = Math.log(70);
const F0_LOG_MAX = Math.log(400);

// Violet (#a78bfa) → magenta (#e879f9) ramp.
const RAMP_A = { r: 0xa7, g: 0x8b, b: 0xfa };
const RAMP_B = { r: 0xe8, g: 0x79, b: 0xf9 };

/** Colour along the violet→magenta ramp for t in [0,1] (rgb string). */
export function rampColor(t: number, alpha = 1): string {
  const u = Math.min(1, Math.max(0, t));
  const r = Math.round(RAMP_A.r + (RAMP_B.r - RAMP_A.r) * u);
  const g = Math.round(RAMP_A.g + (RAMP_B.g - RAMP_A.g) * u);
  const b = Math.round(RAMP_A.b + (RAMP_B.b - RAMP_A.b) * u);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Map continuous f0 (Hz) to a y coordinate (log scale, inverted). */
export function f0ToY(hz: number): number {
  if (hz <= 0) return (SPINE_TOP + SPINE_BOT) / 2;
  const l = (Math.log(hz) - F0_LOG_MIN) / (F0_LOG_MAX - F0_LOG_MIN);
  const u = Math.min(1, Math.max(0, l));
  return SPINE_BOT - u * (SPINE_BOT - SPINE_TOP);
}

export interface RibbonGeom {
  /** filled polygon for the loudness-thick f0 spine. */
  spinePath: string;
  /** thin centre polyline for the f0 line itself. */
  centerPath: string;
  /** one filled area per envelope band, bottom→top stacked. */
  strata: { path: string; color: string }[];
  /** colour of the newest voiced sample (drives the live readout swatch). */
  headColor: string;
}

/** Build all ribbon geometry from a frame buffer (oldest→newest). */
export function buildRibbon(frames: Frame[]): RibbonGeom {
  const n = frames.length;
  if (n < 2) {
    return {
      spinePath: "",
      centerPath: "",
      strata: [],
      headColor: rampColor(0.5),
    };
  }

  const x = (i: number) => (i / (n - 1)) * VIEW_W;

  // ── spine (f0 line + loudness thickness) ──────────────────────────────────
  const top: string[] = [];
  const bot: string[] = [];
  const mid: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const xi = x(i);
    const yi = f0ToY(f.hz > 0 ? f.hz : lastVoicedHz(frames, i));
    const th = 2 + f.rms * 26 * (f.voiced ? 1 : 0.25);
    top.push(`${i === 0 ? "M" : "L"}${xi.toFixed(1)} ${(yi - th).toFixed(1)}`);
    bot.push(`L${xi.toFixed(1)} ${(yi + th).toFixed(1)}`);
    mid.push(`${i === 0 ? "M" : "L"}${xi.toFixed(1)} ${yi.toFixed(1)}`);
  }
  const spinePath = `${top.join(" ")} ${bot.reverse().join(" ")} Z`;
  const centerPath = mid.join(" ");

  // ── colour strata (stacked spectral envelope) ─────────────────────────────
  // For each band b, an area whose thickness at column i ∝ band energy, stacked
  // cumulatively from the baseline upward.
  const cum = new Float32Array(n); // running height per column
  const strata: { path: string; color: string }[] = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    const upper: string[] = [];
    const lower: string[] = [];
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      const energy = (f.bands[b] ?? 0) * (0.35 + 0.65 * f.rms);
      const h = (energy / BAND_COUNT) * STRATA_SPAN;
      const y0 = STRATA_BASE - cum[i];
      const y1 = y0 - h;
      cum[i] += h;
      const xi = x(i);
      lower.push(
        `${i === 0 ? "M" : "L"}${xi.toFixed(1)} ${y0.toFixed(1)}`,
      );
      upper.push(`L${xi.toFixed(1)} ${y1.toFixed(1)}`);
    }
    const path = `${lower.join(" ")} ${upper.reverse().join(" ")} Z`;
    strata.push({ path, color: rampColor(b / (BAND_COUNT - 1), 0.82) });
  }

  const head = frames[n - 1];
  const headT = head.f2 > 0 ? clamp01((head.f2 - 800) / 1800) : 0.5;

  return {
    spinePath,
    centerPath,
    strata,
    headColor: rampColor(headT),
  };
}

function lastVoicedHz(frames: Frame[], i: number): number {
  for (let j = i; j >= 0; j--) {
    if (frames[j].hz > 0) return frames[j].hz;
  }
  return 130;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ── "WORDS · DISCARDED" redaction stream ─────────────────────────────────────

export interface RedactBlock {
  id: number;
  x: number;
  w: number;
  opacity: number;
}

/** Derive a small, recycled set of redaction blocks from the frame buffer:
 *  each voiced burst spawns a "word" block up top that dissolves as it scrolls,
 *  visualising the discarded lexical content. Capped for a low DOM node count. */
export function buildRedaction(frames: Frame[], max = 22): RedactBlock[] {
  const n = frames.length;
  const blocks: RedactBlock[] = [];
  if (n < 3) return blocks;

  const x = (i: number) => (i / (n - 1)) * VIEW_W;
  // Find rising edges of voicing → "word" starts.
  for (let i = 1; i < n && blocks.length < max; i++) {
    const prev = frames[i - 1];
    const cur = frames[i];
    if (cur.voiced && !prev.voiced) {
      // measure the burst length
      let j = i;
      while (j < n && frames[j].voiced) j++;
      const w = Math.max(14, x(j - 1) - x(i));
      // fresh (rightward) = crisp; as it scrolls left it dissolves away.
      const fresh = (i - 1) / (n - 1);
      blocks.push({
        id: i,
        x: x(i),
        w: Math.min(w, 160),
        opacity: 0.06 + 0.44 * fresh,
      });
    }
  }
  return blocks;
}
