// ─────────────────────────────────────────────────────────────────────────────
// 1077 · two-minds — renderer.ts  (Canvas2D)
//
// Two luminous presences on a near-black field: warm (amber/rose) on the left,
// cool (violet/cyan) on the right. Each pulses on its own beat. As synchrony
// rises the two orbs drift toward centre and a woven Lissajous/interference
// figure grows and sharpens between them; at full lock they blend to gold-white.
//
// PHOTOSENSITIVE SAFETY: no strobe. Every pulse is an eased fast-rise / slow-
// luminous-decay glow; global luminance changes are smoothed and stay well under
// 3 Hz. No full-screen flashing.
// ─────────────────────────────────────────────────────────────────────────────

import type { EngineSnapshot } from "./engine";

export interface Renderer {
  draw(snap: EngineSnapshot): void;
  resize(): void;
}

const TWO_PI = Math.PI * 2;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas2D unavailable");

  let w = 0;
  let h = 0;
  let dpr = 1;

  // Smoothed globals so nothing flickers.
  let glow = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Radial luminous orb — additive, soft, eased. */
  function drawOrb(
    cx: number,
    cy: number,
    radius: number,
    pulse: number,
    color: [number, number, number],
  ) {
    const c2 = ctx!;
    const r = radius * (1 + 0.28 * pulse);
    const a = 0.22 + 0.55 * pulse;
    const [rr, gg, bb] = color;
    const g = c2.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rr},${gg},${bb},${a})`);
    g.addColorStop(0.4, `rgba(${rr},${gg},${bb},${a * 0.5})`);
    g.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    c2.fillStyle = g;
    c2.beginPath();
    c2.arc(cx, cy, r, 0, TWO_PI);
    c2.fill();

    // Dense core.
    const core = c2.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.42);
    core.addColorStop(0, `rgba(255,255,255,${0.5 + 0.4 * pulse})`);
    core.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    c2.fillStyle = core;
    c2.beginPath();
    c2.arc(cx, cy, radius * 0.42, 0, TWO_PI);
    c2.fill();
  }

  function draw(snap: EngineSnapshot) {
    const c2 = ctx!;
    // Trailing near-black fill (very subtle persistence for luminous tails).
    c2.globalCompositeOperation = "source-over";
    c2.fillStyle = "rgba(6,7,12,0.34)";
    c2.fillRect(0, 0, w, h);

    const midX = w / 2;
    const midY = h / 2;
    const sync = snap.sync;

    // Presence positions: apart at low sync, drawn to centre at high sync.
    const spread = (0.5 - 0.32 * snap.approach) * w; // half-distance between orbs
    const lx = midX - spread * 0.5;
    const rx = midX + spread * 0.5;

    const baseR = Math.min(w, h) * 0.11;

    // Colours: warm mind, cool mind; blend toward gold-white at lock.
    const warm: [number, number, number] = [
      255,
      Math.round(150 + 90 * sync),
      Math.round(90 + 120 * sync),
    ];
    const cool: [number, number, number] = [
      Math.round(150 + 100 * sync),
      Math.round(150 + 90 * sync),
      Math.round(255),
    ];

    // ── Woven interference figure between the two minds. ───────────────────
    // A Lissajous traced from the two phases; opacity/definition grow with sync.
    const weaveA = 0.06 + 0.6 * sync;
    if (weaveA > 0.02) {
      c2.globalCompositeOperation = "lighter";
      const amp = Math.min(w, h) * (0.1 + 0.14 * snap.approach);
      const cx = midX;
      const cy = midY;
      const steps = 220;
      // Frequencies from the two tempi give a moiré that tightens at lock.
      const fa = 2 + snap.freqLocal;
      const fb = 2 + snap.freqRemote;
      const gold = 0.5 + 0.5 * sync;
      c2.lineWidth = 1 + 1.6 * sync;
      c2.strokeStyle = `rgba(${Math.round(200 + 55 * gold)},${Math.round(
        180 + 60 * gold,
      )},${Math.round(120 + 90 * gold)},${weaveA})`;
      c2.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * TWO_PI;
        const x = cx + amp * Math.sin(fa * t + snap.phaseLocal);
        const y = cy + amp * Math.sin(fb * t + snap.phaseRemote);
        if (i === 0) c2.moveTo(x, y);
        else c2.lineTo(x, y);
      }
      c2.stroke();

      // A connecting filament between the orbs that brightens & straightens at lock.
      const filA = 0.05 + 0.4 * sync;
      c2.strokeStyle = `rgba(255,240,210,${filA})`;
      c2.lineWidth = 0.6 + 2.4 * sync;
      c2.beginPath();
      const sag = (1 - sync) * Math.min(w, h) * 0.12;
      c2.moveTo(lx, midY);
      c2.quadraticCurveTo(midX, midY + sag * Math.sin(snap.phaseLocal), rx, midY);
      c2.stroke();
    }

    // ── The two presences. ─────────────────────────────────────────────────
    c2.globalCompositeOperation = "lighter";
    drawOrb(lx, midY, baseR, snap.pulseLocal, warm);
    drawOrb(rx, midY, baseR, snap.pulseRemote, cool);

    // Shared bloom halo at full sync — one gold-white field where they meet.
    glow += (snap.bloom - glow) * 0.08;
    if (glow > 0.02) {
      const bg = c2.createRadialGradient(
        midX,
        midY,
        0,
        midX,
        midY,
        Math.min(w, h) * (0.35 + 0.25 * glow),
      );
      bg.addColorStop(0, `rgba(255,244,214,${0.16 * glow})`);
      bg.addColorStop(1, "rgba(255,244,214,0)");
      c2.fillStyle = bg;
      c2.fillRect(0, 0, w, h);
    }

    c2.globalCompositeOperation = "source-over";
  }

  resize();
  return { draw, resize };
}
