// ─────────────────────────────────────────────────────────────────────────────
// viz.ts — the Canvas2D modal-spectrum visualizer.
//
// Draws the ACTUAL live modal spectrum coming out of the engine: every active
// vibrational mode is one vertical bar whose height = that mode's current
// energy and whose X-position = its frequency on a log axis. Because the
// engine's mode energies are the real decaying resonator envelopes, you SEE the
// inharmonic dispersion (bars land at stretched, non-integer spacings) and the
// frequency-dependent decay (bright high bars fade first) that you HEAR.
//
// Palette: warm bronze / patina-metal on near-black. Art-layer colour only.
// No fast luminance flicker — all motion is smooth energy decay + a ≪1 Hz drift.
// ─────────────────────────────────────────────────────────────────────────────

import type { MaterialId, SpectrumBar } from "./synth";

const F_MIN = 60;
const F_MAX = 16000;
const LOG_MIN = Math.log(F_MIN);
const LOG_SPAN = Math.log(F_MAX) - LOG_MIN;

// bronze / patina material tints (hue anchor per material)
const MATERIAL_TINT: Record<MaterialId, [number, number, number]> = {
  bronze: [38, 78, 58], // warm gold  (hsl H,S%,L% base)
  bowl: [44, 55, 62], // pale brass
  plate: [26, 70, 52], // deep copper
};

function freqToX(f: number, w: number): number {
  const t = (Math.log(Math.max(F_MIN, f)) - LOG_MIN) / LOG_SPAN;
  return 40 + t * (w - 80);
}

export interface VizState {
  /** accumulated seconds (drift phase) */
  t: number;
  reducedMotion: boolean;
}

/** Paint one frame. `bars` is the live spectrum; `flash` 0..1 pulses on strike. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: SpectrumBar[],
  state: VizState,
  flash: number,
): void {
  // near-black bronze-tinted ground with a slow radial breath (≪1 Hz)
  const breath = state.reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(state.t * 0.35);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0b0805");
  g.addColorStop(1, "#070502");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const baseY = h * 0.82;

  // faint vault-arch guides (patina)
  ctx.save();
  ctx.globalAlpha = 0.12 + breath * 0.05;
  ctx.strokeStyle = "hsl(160, 30%, 45%)"; // verdigris hint
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const yy = baseY - (baseY * 0.85 * i) / 4;
    ctx.beginPath();
    ctx.moveTo(40, yy);
    ctx.lineTo(w - 40, yy);
    ctx.stroke();
  }
  ctx.restore();

  // baseline
  ctx.strokeStyle = "hsl(38, 40%, 30%)";
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(30, baseY);
  ctx.lineTo(w - 30, baseY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const maxBarH = baseY * 0.9;

  // draw each mode as a glowing bar + a soft ring at its head
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of bars) {
    const x = freqToX(b.freq, w);
    const e = Math.pow(b.energy, 0.7); // perceptual lift
    const barH = e * maxBarH;
    const [hue, sat, lig] = MATERIAL_TINT[b.material];
    // higher partials skew slightly cooler/brighter for depth
    const hh = hue + b.partialIndex * 3;
    const ll = Math.min(72, lig + e * 22);

    // vertical bar with a vertical gradient (metal sheen)
    const grad = ctx.createLinearGradient(0, baseY, 0, baseY - barH);
    grad.addColorStop(0, `hsla(${hh}, ${sat}%, ${ll * 0.5}%, 0.15)`);
    grad.addColorStop(1, `hsla(${hh}, ${sat}%, ${ll}%, ${0.35 + e * 0.5})`);
    const bw = 2 + e * 3;
    ctx.fillStyle = grad;
    ctx.fillRect(x - bw / 2, baseY - barH, bw, barH);

    // glowing head
    const r = 2 + e * 7;
    const glow = ctx.createRadialGradient(x, baseY - barH, 0, x, baseY - barH, r * 3);
    glow.addColorStop(0, `hsla(${hh}, ${sat}%, ${Math.min(82, ll + 12)}%, ${0.5 * e + 0.1})`);
    glow.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, baseY - barH, r * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(${hh}, ${sat}%, ${Math.min(88, ll + 16)}%, ${0.6 * e + 0.2})`;
    ctx.beginPath();
    ctx.arc(x, baseY - barH, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // strike flash: a soft bronze wash from the baseline (smooth, no strobe)
  if (flash > 0.001) {
    const fg = ctx.createLinearGradient(0, baseY, 0, 0);
    fg.addColorStop(0, `hsla(40, 80%, 60%, ${0.16 * flash})`);
    fg.addColorStop(1, "hsla(40, 80%, 60%, 0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, w, baseY);
  }

  // frequency axis ticks (tiny, mono-ish labels handled by DOM; ticks only here)
  ctx.strokeStyle = "hsla(38, 30%, 45%, 0.35)";
  ctx.lineWidth = 1;
  const ticks = [100, 250, 500, 1000, 2000, 4000, 8000];
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "hsla(38, 35%, 55%, 0.5)";
  ctx.textAlign = "center";
  for (const tk of ticks) {
    const x = freqToX(tk, w);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + 5);
    ctx.stroke();
    ctx.fillText(tk >= 1000 ? `${tk / 1000}k` : `${tk}`, x, baseY + 17);
  }
}
