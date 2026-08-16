// ─────────────────────────────────────────────────────────────────────────────
// 14336 · tidalstrata — Canvas2D geological cross-section.
//
// Two coupled views, earthy sediment palette (ochre / umber / sand / clay on
// bone). Raw hex/HSL is allowed here because it is canvas ART, not UI chrome.
//
//   LIVE SURFACE (top, not scrolling): the strata sounding NOW, each a horizontal
//   band whose thickness = its gain and whose internal roughness = its live
//   spectral energy (read from that stratum's own AnalyserNode). Residues appear
//   as faint buried threads.
//
//   RECORD (below, scrolls down): the accreted history. Each frame deposits new
//   sediment at the surface proportional to the total energy of the mass, so a
//   long-held loud stratum lays a thick band and a quiet passage lays a thin one.
//   Old sediment compresses toward the bottom "memory" zone and dims. When a
//   buried layer resurfaces, its hue reappears in fresh deposits — you can read
//   where you are, what came before, and when a layer returns.
// ─────────────────────────────────────────────────────────────────────────────

import type { StratumView } from "./strata";

// earthy background tones
const BONE = "#e9e0cf";
const UMBER_LINE = "#8a6a44";

export function earthy(hue: number, sat: number, light: number, a = 1): string {
  return `hsla(${hue}, ${sat}%, ${light}%, ${a})`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Deterministic value-noise for band grain (no per-frame allocation churn).
function grain(x: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s); // 0..1
}

/**
 * The accreting geological record: an offscreen buffer that scrolls downward as
 * new sediment is laid on top. Ping-pong between two canvases so the self-copy
 * never smears.
 */
export class SedimentRecord {
  private a: HTMLCanvasElement;
  private b: HTMLCanvasElement;
  private cur: HTMLCanvasElement;
  private w = 0;
  private h = 0;
  private accum = 0; // fractional pixels waiting to be deposited

  constructor() {
    this.a = document.createElement("canvas");
    this.b = document.createElement("canvas");
    this.cur = this.a;
  }

  get canvas(): HTMLCanvasElement {
    return this.cur;
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    for (const c of [this.a, this.b]) {
      c.width = this.w;
      c.height = this.h;
      const g = c.getContext("2d");
      if (g) {
        g.fillStyle = BONE;
        g.fillRect(0, 0, this.w, this.h);
      }
    }
  }

  /**
   * Advance the record. `rate` is deposition speed in px/sec (already scaled by
   * the mass's total energy by the caller). Deposits the current strata profile.
   */
  step(dt: number, rate: number, active: StratumView[], elapsed: number): void {
    if (this.w === 0) return;
    this.accum += rate * dt;
    let n = Math.floor(this.accum);
    if (n <= 0) return;
    if (n > 24) n = 24; // guard against long frame stalls
    this.accum -= n;

    const from = this.cur;
    const to = this.cur === this.a ? this.b : this.a;
    const g = to.getContext("2d");
    if (!g) return;

    // scroll the existing record down by n px into the other buffer
    g.clearRect(0, 0, this.w, this.h);
    g.drawImage(from, 0, n);

    // fresh deposit strip [0..n]
    this.deposit(g, n, active, elapsed);
    this.cur = to;
  }

  private deposit(
    g: CanvasRenderingContext2D,
    n: number,
    active: StratumView[],
    elapsed: number,
  ): void {
    const w = this.w;
    // background (open water / no deposition)
    g.fillStyle = BONE;
    g.fillRect(0, 0, w, n);

    const stack = active
      .filter((s) => s.phase !== "residue" && s.gain > 0.01)
      .sort((a, b) => a.slot - b.slot);
    const total = stack.reduce((sum, s) => sum + s.gain, 0);
    if (total <= 0) return;

    // partition the strip vertically by each stratum's share of the mass
    let y = 0;
    for (const s of stack) {
      const bandH = (s.gain / total) * n;
      const light = clamp(38 + s.energy * 26, 30, 70);
      // draw column-by-column so energy adds horizontal grain to the rock
      for (let x = 0; x < w; x++) {
        const gr = grain(x, s.slot + Math.floor(elapsed));
        const lv = clamp(light + (gr - 0.5) * (10 + s.energy * 34), 24, 78);
        g.fillStyle = earthy(s.hue, s.sat, lv);
        g.fillRect(x, Math.round(y), 1, Math.ceil(bandH) + 1);
      }
      y += bandH;
    }
    // thin bounding line at the new surface — a stratigraphic contact
    g.fillStyle = UMBER_LINE;
    g.globalAlpha = 0.18;
    g.fillRect(0, 0, w, 1);
    g.globalAlpha = 1;
  }
}

// ── main-canvas composition ───────────────────────────────────────────────────

export interface RenderState {
  active: StratumView[];
  elapsed: number;
  total: number;
  seaTarget: number; // 1..4 desired strata (for the marker)
  prismShift: number; // -2..2
}

const LIVE_H = 150; // live-surface panel height (css px)

export function drawScene(
  g: CanvasRenderingContext2D,
  record: SedimentRecord,
  w: number,
  h: number,
  st: RenderState,
): void {
  // bone ground
  g.fillStyle = BONE;
  g.fillRect(0, 0, w, h);

  const recordY = LIVE_H;
  const recordH = h - LIVE_H;

  // 1) the accreted record beneath the live surface
  record.resize(w, recordH);
  g.drawImage(record.canvas, 0, recordY);

  // deep-memory dimming toward the bottom
  const dim = g.createLinearGradient(0, recordY, 0, h);
  dim.addColorStop(0, "rgba(216,204,180,0)");
  dim.addColorStop(1, "rgba(120,96,60,0.42)");
  g.fillStyle = dim;
  g.fillRect(0, recordY, w, recordH);

  // 2) live surface panel
  drawLiveSurface(g, w, LIVE_H, st.active, st.elapsed);

  // seam between surface and record
  g.strokeStyle = UMBER_LINE;
  g.globalAlpha = 0.4;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, recordY + 0.5);
  g.lineTo(w, recordY + 0.5);
  g.stroke();
  g.globalAlpha = 1;

  // 3) chrome overlays (still canvas art)
  drawTimeMarker(g, w, h, st);
  drawSeaMarker(g, w, st);
}

function drawLiveSurface(
  g: CanvasRenderingContext2D,
  w: number,
  hh: number,
  active: StratumView[],
  elapsed: number,
): void {
  // faint water/sky wash above the seabed
  const sky = g.createLinearGradient(0, 0, 0, hh);
  sky.addColorStop(0, "rgba(233,224,207,1)");
  sky.addColorStop(1, "rgba(224,212,188,1)");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hh);

  // residues: faint buried threads drifting across the panel
  const residues = active.filter((s) => s.phase === "residue");
  residues.forEach((s, i) => {
    const y = 22 + ((i * 37 + s.slot * 13) % Math.max(1, hh - 40));
    g.strokeStyle = earthy(s.hue, s.sat, 44, 0.22);
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * 0.02 + s.slot + elapsed * 0.1) * 4;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  });

  // active strata stacked upward from the seabed, thickness = gain
  const stack = active
    .filter((s) => s.phase !== "residue")
    .sort((a, b) => a.slot - b.slot);
  const totalGain = stack.reduce((s, x) => s + x.gain, 0);
  const usable = hh - 20;
  const scale = totalGain > 0 ? Math.min(usable / totalGain, usable) : 0;

  let y = hh - 10;
  for (const s of stack) {
    const bandH = Math.max(2, s.gain * scale);
    const top = y - bandH;
    const light = clamp(40 + s.energy * 24, 32, 70);

    // band body with vertical energy grain
    for (let x = 0; x < w; x += 2) {
      const gr = grain(x + s.slot * 7, s.slot + Math.floor(elapsed * 6));
      const wob = (gr - 0.5) * s.energy * 18;
      const lv = clamp(light + (gr - 0.5) * 16, 26, 78);
      g.fillStyle = earthy(s.hue, s.sat, lv);
      g.fillRect(x, top - wob, 2, bandH + Math.abs(wob) + 1);
    }
    // upper contact line
    g.strokeStyle = earthy(s.hue, clamp(s.sat + 8, 0, 100), 30, 0.5);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, top);
    g.lineTo(w, top);
    g.stroke();

    y = top;
  }
}

function drawTimeMarker(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  st: RenderState,
): void {
  const pad = 14;
  const barW = w - pad * 2;
  const y = h - 12;
  g.fillStyle = "rgba(120,96,60,0.28)";
  g.fillRect(pad, y, barW, 3);
  const p = clamp(st.elapsed / st.total, 0, 1);
  g.fillStyle = "#6b4f2c";
  g.fillRect(pad, y, barW * p, 3);
  g.fillStyle = "#6b4f2c";
  g.beginPath();
  g.arc(pad + barW * p, y + 1.5, 3.5, 0, Math.PI * 2);
  g.fill();
}

function drawSeaMarker(
  g: CanvasRenderingContext2D,
  w: number,
  st: RenderState,
): void {
  // right-edge tick column: how high the "sea level" (active-strata target) sits
  const x = w - 14;
  const top = 22;
  const h = 96;
  g.strokeStyle = "rgba(120,96,60,0.35)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, top);
  g.lineTo(x, top + h);
  g.stroke();
  for (let i = 1; i <= 4; i++) {
    const yy = top + h - (i / 4) * h;
    g.fillStyle =
      i <= Math.round(st.seaTarget) ? "#8a6a44" : "rgba(120,96,60,0.28)";
    g.fillRect(x - 4, yy - 1.5, 8, 3);
  }
}

export { LIVE_H };
