// render.ts — 1064-carrier-melt Canvas2D feedback-trail renderer.
//
// The melt engine: a ping-pong feedback buffer (color trails / tracers) warped
// by a log-polar / form-constant domain map (Bressloff–Cowan / Klüver). Each
// frame we:
//   1. sample last frame's pixels through a log-polar warp (a coarse grid,
//      bilinear-ish), pushing/pulling around a focus center → "surfaces breathing";
//   2. fade slightly (trail decay driven by mids) and tint warm/iridescent;
//   3. paint fresh form-constant ribbons whose density/phase come from the
//      music's FFT energy + the pointer.
//
// Audio drives structure; the pointer (position = warp focus, speed = warp gain
// + saturation) is the instrument. NO WebGL fragment shader — pure Canvas2D.
//
// We mirror _shared/psych/logpolar.ts math (screenToCortex / cortexToScreen /
// formConstant) inline so the CPU warp stays self-contained and fast.

import type { SpectralEnergy } from "./audio";

export interface MeltInput {
  energy: SpectralEnergy;
  // Pointer in [0,1] canvas space; warpGain/saturation in [0,1].
  focusX: number;
  focusY: number;
  warpGain: number; // pointer speed → how hard the field melts.
  saturation: number;
  timeSec: number;
  reducedMotion: boolean;
}

export interface MeltRenderer {
  render(input: MeltInput): void;
  resize(): void;
  dispose(): void;
}

// Warp grid resolution. The feedback frame is resampled on a GRID×GRID lattice
// of quads; each quad is drawn from the previous frame via drawImage with a
// per-quad source offset, which is cheap and gives the smeary "melt".
const GRID = 22;

function makeOffscreen(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function createMeltRenderer(canvas: HTMLCanvasElement): MeltRenderer {
  const view = canvas.getContext("2d", { alpha: false });
  if (!view) throw new Error("Canvas2D unavailable");

  // Two ping-pong buffers at device resolution (capped for perf).
  let bufW = 1;
  let bufH = 1;
  let a = makeOffscreen(1, 1);
  let b = makeOffscreen(1, 1);
  let aCtx = a.getContext("2d", { alpha: false })!;
  let bCtx = b.getContext("2d", { alpha: false })!;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    if (w === bufW && h === bufH) return;
    bufW = w;
    bufH = h;
    canvas.width = w;
    canvas.height = h;
    a = makeOffscreen(w, h);
    b = makeOffscreen(w, h);
    aCtx = a.getContext("2d", { alpha: false })!;
    bCtx = b.getContext("2d", { alpha: false })!;
    aCtx.fillStyle = "#05060a";
    aCtx.fillRect(0, 0, w, h);
    bCtx.fillStyle = "#05060a";
    bCtx.fillRect(0, 0, w, h);
  };
  resize();

  // ── log-polar / form-constant helpers (mirror _shared/psych/logpolar.ts) ──
  const screenToCortexU = (x: number, y: number): number =>
    Math.log(Math.max(Math.hypot(x, y), 1e-4));
  const screenToCortexV = (x: number, y: number): number => Math.atan2(y, x);

  // Smoothed drivers so the field never jitters frame-to-frame.
  let sFlow = 0.3;
  let sWarp = 0.2;
  let sHue = 0.55;
  let sSat = 0.4;
  let sFocusX = 0.5;
  let sFocusY = 0.5;
  let autoT = Math.random() * 1000;

  const render = (input: MeltInput) => {
    const { energy, reducedMotion } = input;
    const w = bufW;
    const h = bufH;

    // Smooth drivers (exp moving average).
    const k = reducedMotion ? 0.04 : 0.12;
    sFlow += (0.15 + energy.bass * 0.85 - sFlow) * k;
    sWarp += (input.warpGain - sWarp) * k;
    sHue += (energy.mid - sHue) * k;
    sSat += (Math.max(input.saturation, energy.loudness) - sSat) * k;
    sFocusX += (input.focusX - sFocusX) * 0.08;
    sFocusY += (input.focusY - sFocusY) * 0.08;
    autoT += reducedMotion ? 0.002 : 0.004 + sFlow * 0.02;

    const t = input.timeSec;
    // Autonomous drift of the focus when the hand is still, so it lives.
    const driftX = sFocusX + Math.sin(autoT * 0.7) * 0.04 * (1 - sWarp);
    const driftY = sFocusY + Math.cos(autoT * 0.53) * 0.04 * (1 - sWarp);
    const fcx = driftX * w;
    const fcy = driftY * h;

    // ── 1. Warp previous frame (a) into b via a per-quad log-polar push ──────
    // The "melt": each grid node is displaced along the log-polar gradient
    // around the focus, scaled by bass (amplitude) and pointer warp gain.
    const warpAmp = (8 + sFlow * 40 + sWarp * 90) * (reducedMotion ? 0.25 : 1);
    const cw = w / GRID;
    const ch = h / GRID;

    bCtx.clearRect(0, 0, w, h);
    bCtx.imageSmoothingEnabled = true;

    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const dx0 = (gx + 0.5) * cw - fcx;
        const dy0 = (gy + 0.5) * ch - fcy;
        // Normalize to ~unit so log-polar behaves across resolutions.
        const nx = dx0 / (w * 0.5);
        const ny = dy0 / (h * 0.5);
        const u = screenToCortexU(nx, ny);
        const vAng = screenToCortexV(nx, ny);
        const r = Math.hypot(nx, ny) + 1e-3;

        // Form-constant displacement: a spiral-ish swirl + a radial breath.
        const spiral = Math.sin(u * 3.0 - autoT * 1.3 + vAng * 2.0);
        const breath = Math.sin(vAng * 5.0 + u * 2.0 + t * 0.6);
        // Inward pull (tunnel) modulated by bass; tangential swirl by warp gain.
        const radial = (-spiral * (0.5 + sFlow)) * warpAmp / (r * 18 + 1);
        const tang = (breath * sWarp) * warpAmp / (r * 14 + 1);

        // Convert radial+tangential back to screen offset.
        const ca = Math.cos(vAng);
        const sa = Math.sin(vAng);
        const offX = radial * ca - tang * sa;
        const offY = radial * sa + tang * ca;

        // Draw the source quad from `a` shifted by (offX,offY): pulling pixels
        // toward/around focus produces the smear/tracer.
        const sx = gx * cw - offX;
        const sy = gy * ch - offY;
        bCtx.drawImage(
          a,
          sx, sy, cw + 1, ch + 1,
          gx * cw, gy * ch, cw + 1, ch + 1,
        );
      }
    }

    // ── 2. Trail decay + warm iridescent tint (mids drive decay) ────────────
    const decay = 0.10 + sHue * 0.10; // higher mids = faster clear = crisper.
    bCtx.globalCompositeOperation = "source-over";
    bCtx.fillStyle = `rgba(5, 6, 12, ${decay})`;
    bCtx.fillRect(0, 0, w, h);

    // Iridescent wash: a slowly hue-rotating soft glow added over everything.
    const washHue = (t * 8 + sHue * 120 + 200) % 360;
    bCtx.globalCompositeOperation = "lighter";
    const wash = bCtx.createRadialGradient(fcx, fcy, 0, fcx, fcy, Math.max(w, h) * 0.7);
    const sat = Math.round(35 + sSat * 55);
    wash.addColorStop(0, `hsla(${washHue}, ${sat}%, 60%, ${0.05 + sSat * 0.08})`);
    wash.addColorStop(1, `hsla(${(washHue + 60) % 360}, ${sat}%, 30%, 0)`);
    bCtx.fillStyle = wash;
    bCtx.fillRect(0, 0, w, h);

    // ── 3. Fresh form-constant ribbons painted in cortical space ────────────
    // We stamp glowing arcs whose angular density = highs, radial phase = time.
    const rings = reducedMotion ? 4 : 7;
    const baseHue = (washHue + 140) % 360;
    bCtx.lineCap = "round";
    for (let i = 0; i < rings; i++) {
      const rr = (i + 1) / (rings + 1);
      const radius = rr * Math.min(w, h) * (0.55 + sFlow * 0.2);
      const segs = 60;
      const hue = (baseHue + i * 18 + energy.high * 80) % 360;
      const light = 50 + energy.high * 25;
      const alpha = 0.12 + sSat * 0.25;
      bCtx.strokeStyle = `hsla(${hue}, ${Math.round(55 + sSat * 40)}%, ${light}%, ${alpha})`;
      bCtx.lineWidth = 1.5 + sWarp * 4 + energy.bass * 3;
      bCtx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        // Ribbon wobble: a form-constant plane wave (mirrors formConstant()).
        const wob =
          Math.sin(ang * 6 + autoT * 2 + i) * (6 + energy.high * 26) +
          Math.sin(ang * 3 - t * 1.1) * (4 + sWarp * 22);
        const rad = radius + wob;
        const px = fcx + Math.cos(ang + autoT * 0.2 * (i % 2 ? 1 : -1)) * rad;
        const py = fcy + Math.sin(ang + autoT * 0.2 * (i % 2 ? 1 : -1)) * rad * 0.92;
        if (s === 0) bCtx.moveTo(px, py);
        else bCtx.lineTo(px, py);
      }
      bCtx.stroke();
    }

    // Bright focus core — the "where the melt focuses" cursor of light.
    const core = bCtx.createRadialGradient(fcx, fcy, 0, fcx, fcy, 40 + sWarp * 120);
    core.addColorStop(0, `hsla(${(baseHue + 40) % 360}, 90%, 75%, ${0.18 + sWarp * 0.4})`);
    core.addColorStop(1, "hsla(0,0%,0%,0)");
    bCtx.fillStyle = core;
    bCtx.fillRect(0, 0, w, h);

    bCtx.globalCompositeOperation = "source-over";

    // ── Present b to the visible canvas, then swap a<->b for next frame ──────
    view.drawImage(b, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
    const tmp = a;
    a = b;
    b = tmp;
    const tmpCtx = aCtx;
    aCtx = bCtx;
    bCtx = tmpCtx;
  };

  return {
    render,
    resize,
    dispose: () => {
      a.width = 0;
      b.width = 0;
    },
  };
}
