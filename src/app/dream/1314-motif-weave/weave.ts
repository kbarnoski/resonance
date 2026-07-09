// 1314-motif-weave — weave.ts
// The woven light-field. Canvas2D. Each remembered motif is ONE persistent
// luminous thread (a weft), woven across a faint vertical loom (the warp = the
// score's pulse grid). A thread's height/undulation encodes its pitch contour;
// it blooms when its motif is currently sounding (recall or live play). Threads
// persist and accumulate, so the weave at minute 6 is visibly denser and more
// interwoven than at minute 1 — the visual is the record of what you played.
//
// Pure drawing from an engine snapshot. No React, no audio. Palette: dusk
// violet → indigo → dawn gold. Additive blending gives bloom at crossings.

import type { MotifEngine } from "./engine";

const TAU = Math.PI * 2;

export interface WeaveOpts {
  W: number;
  H: number;
  dpr: number;
  nowMs: number;
  flick: number; // luminance multiplier from SafeFlicker (1 = steady)
}

// Overall arc progress → background dusk→dawn tint.
function bgFor(g: CanvasRenderingContext2D, W: number, H: number, prog: number, breath: number) {
  // violet → indigo → warm gold, very dark.
  const top = mix3([26, 12, 40], [16, 14, 46], [30, 24, 30], prog);
  const bot = mix3([10, 6, 20], [8, 10, 28], [22, 14, 12], prog);
  const grad = g.createLinearGradient(0, 0, 0, H);
  const b = 1 + breath * 0.5;
  grad.addColorStop(0, `rgb(${top[0] * b | 0},${top[1] * b | 0},${top[2] * b | 0})`);
  grad.addColorStop(1, `rgb(${bot[0] | 0},${bot[1] | 0},${bot[2] | 0})`);
  return grad;
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function mix3(a: number[], b: number[], c: number[], t: number): number[] {
  if (t < 0.5) {
    const u = t * 2;
    return [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
  }
  const u = (t - 0.5) * 2;
  return [mix(b[0], c[0], u), mix(b[1], c[1], u), mix(b[2], c[2], u)];
}

export function drawWeave(g: CanvasRenderingContext2D, eng: MotifEngine, o: WeaveOpts): void {
  const { W, H, nowMs, flick } = o;
  const prog = Math.min(1, eng.elapsed / 345);
  const breath = eng.breath;
  const bright = eng.brightness;

  // Trailing dusk wash — motion blur + palette in one pass.
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.fillStyle = bgFor(g, W, H, prog, breath);
  g.fillRect(0, 0, W, H);
  // Slight extra darkening veil so old light decays (dream forgetting the frame,
  // never the motif).
  g.fillStyle = "rgba(6,4,14,0.28)";
  g.fillRect(0, 0, W, H);

  const marginY = H * 0.1;
  const usableH = H * 0.8;

  // ── Warp: the loom / pulse grid. Faint vertical filaments that brighten on
  // the beat, giving the weave its time structure. ──
  const warpN = 26;
  const beatPulse = 0.5 + 0.5 * Math.cos(eng.beatPhase * TAU); // bright on downbeat
  g.globalCompositeOperation = "lighter";
  for (let k = 0; k < warpN; k++) {
    const x = (W * (k + 0.5)) / warpN;
    const drift = Math.sin(nowMs * 0.0004 + k * 0.6) * (W / warpN) * 0.25;
    const a = (0.015 + 0.05 * beatPulse * (0.4 + 0.6 * bright)) * flick;
    g.strokeStyle = `hsla(${(255 - prog * 200 + 360) % 360}, 60%, 70%, ${a})`;
    g.lineWidth = o.dpr;
    g.beginPath();
    g.moveTo(x + drift, marginY * 0.4);
    g.lineTo(x - drift, H - marginY * 0.4);
    g.stroke();
  }

  // ── Weft: one thread per remembered motif. ──
  const motifs = eng.motifs;
  const seg = 56; // x-samples per thread
  for (let mi = 0; mi < motifs.length; mi++) {
    const m = motifs[mi];
    const glow = Math.max(0, 1 - (nowMs - m.glowAt) / m.glowDur); // 0..1, sounding now?
    const age = Math.min(1, (eng.elapsed - m.born) / 90);

    // Base height from mean pitch, spread by a stable per-motif jitter so the
    // loom fills out instead of clustering.
    const yBase = marginY + usableH * (0.55 * (1 - m.avgNorm) + 0.45 * m.ySeed);
    const amp = usableH * (0.05 + 0.12 * (m.contour.length > 1 ? 1 : 0.4));
    // Horizontal drift so each thread slowly shimmers across the loom.
    const scroll = (nowMs * 0.00003 * (0.6 + m.ySeed)) % 1;

    const baseL = 22 + 18 * (1 - age * 0.5); // older threads dimmer but persistent
    const lum = (baseL + glow * 55) * flick;
    const sat = 60 + glow * 25;
    const lineW = (m.origin === "played" ? 1.6 : 1.0) * (1 + glow * 1.8) * o.dpr;

    // Glow halo when sounding — the "lucid bloom".
    if (glow > 0.02) {
      g.strokeStyle = `hsla(${m.hue}, ${sat}%, ${Math.min(78, lum + 10)}%, ${0.08 * glow * flick})`;
      g.lineWidth = lineW * 4;
      strokeThread(g, m.contour, seg, W, yBase, amp, scroll, nowMs, glow, prog);
    }

    g.strokeStyle = `hsla(${m.hue}, ${sat}%, ${Math.min(82, lum)}%, ${(0.5 + 0.5 * glow) * flick})`;
    g.lineWidth = lineW;
    strokeThread(g, m.contour, seg, W, yBase, amp, scroll, nowMs, glow, prog);

    // Knots where the weft crosses warp lines — bright beads when sounding.
    if (glow > 0.15) {
      for (let k = 0; k < warpN; k += 3) {
        const x = (W * (k + 0.5)) / warpN;
        const u = x / W;
        const y = threadY(m.contour, u, yBase, amp, scroll, nowMs, glow);
        const r = (1.2 + glow * 2.5) * o.dpr;
        g.fillStyle = `hsla(${m.hue}, 80%, ${Math.min(88, 60 + glow * 25)}%, ${0.5 * glow * flick})`;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
    }
  }

  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}

function threadY(
  contour: number[],
  u: number,
  yBase: number,
  amp: number,
  scroll: number,
  nowMs: number,
  glow: number,
): number {
  // Sample the pitch contour along x (wrapping with the horizontal scroll).
  const n = contour.length;
  const fp = ((u + scroll) % 1) * (n - 1);
  const i0 = Math.floor(fp);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = fp - i0;
  const c = mix(contour[i0] ?? 0.5, contour[i1] ?? 0.5, f); // 0..1 pitch
  // Contour bumps the thread up/down; a woven sine ripple gives the cloth its
  // shimmer (stronger when the motif is sounding).
  const bump = (c - 0.5) * amp * 2.2;
  const weave = Math.sin(u * TAU * 3 + nowMs * 0.0012) * amp * (0.25 + 0.5 * glow);
  return yBase + bump + weave;
}

function strokeThread(
  g: CanvasRenderingContext2D,
  contour: number[],
  seg: number,
  W: number,
  yBase: number,
  amp: number,
  scroll: number,
  nowMs: number,
  glow: number,
  prog: number,
): void {
  g.beginPath();
  for (let s = 0; s <= seg; s++) {
    const u = s / seg;
    const x = u * W;
    // A subtle global warp pulls the whole cloth as the dream deepens.
    const warp = Math.sin(u * TAU + nowMs * 0.0003) * amp * 0.3 * prog;
    const y = threadY(contour, u, yBase, amp, scroll, nowMs, glow) + warp;
    if (s === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}
