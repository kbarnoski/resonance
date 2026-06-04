// ─────────────────────────────────────────────────────────────────────────────
// aurora.ts — Canvas2D aurora-curtain renderer driven by the solar wind.
//
// Deliberately NOT a full-screen noise fragment shader. The aurora is built
// from a small set of layered vertical CURTAINS: each curtain is a smooth
// horizontal band whose top edge waves like a hanging sheet, filled with a
// vertical green->magenta gradient that fades to nothing at the bottom. The
// curtains drift sideways and ripple; geomagnetic activity (Kp / southward Bz)
// raises their brightness, turbulence and reach, so a storm visibly lights the
// sky. A faint star field and the live audio level add shimmer.
//
// Everything here is plain drawing math fed by the merged WindSample, so the
// shapes read as folded sheets of light — aurora, not static.
// ─────────────────────────────────────────────────────────────────────────────

import type { WindSample } from "./space-weather";

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function norm(x: number, lo: number, hi: number): number {
  return clamp((x - lo) / (hi - lo), 0, 1);
}

interface Curtain {
  baseX: number; // 0..1 horizontal anchor
  hue: number; // base hue (green..emerald range, shifts toward magenta when active)
  phase: number; // wave phase offset
  freq: number; // horizontal ripple frequency
  drift: number; // sideways drift speed
  width: number; // 0..1 fraction of screen width
  depth: number; // vertical reach 0..1
}

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number; // twinkle phase
}

export interface AuroraRenderer {
  resize: (w: number, h: number, dpr: number) => void;
  /** Render one frame. level is current audio energy 0..1. */
  draw: (s: WindSample, level: number, dtMs: number) => void;
}

export function createAuroraRenderer(
  ctx: CanvasRenderingContext2D,
): AuroraRenderer {
  let W = 1;
  let H = 1;
  let time = 0;

  // A handful of curtains, spread across the sky at varied depths.
  const N = 6;
  const curtains: Curtain[] = Array.from({ length: N }, (_, i) => {
    const f = i / (N - 1);
    return {
      baseX: 0.08 + f * 0.84 + (Math.random() - 0.5) * 0.06,
      hue: 135 + Math.random() * 30, // greens
      phase: Math.random() * Math.PI * 2,
      freq: 1.4 + Math.random() * 2.2,
      drift: (Math.random() - 0.5) * 0.018,
      width: 0.16 + Math.random() * 0.14,
      depth: 0.55 + Math.random() * 0.4,
    };
  });

  const stars: Star[] = Array.from({ length: 90 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.7,
    r: Math.random() * 1.3 + 0.3,
    tw: Math.random() * Math.PI * 2,
  }));

  function resize(w: number, h: number, dpr: number) {
    W = w;
    H = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSky() {
    // Near-black cosmic gradient, faintly warmer at the horizon.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#02030a");
    g.addColorStop(0.55, "#04040d");
    g.addColorStop(1, "#070611");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    for (const st of stars) {
      const tw = 0.5 + 0.5 * Math.sin(time * 0.6 + st.tw);
      ctx.globalAlpha = 0.25 + tw * 0.45;
      ctx.fillStyle = "#cdd6ff";
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCurtain(c: Curtain, activity: number, south: number, level: number) {
    // Activity (0..1) raises brightness, ripple amplitude and vertical reach.
    const topY = H * (0.06 + (1 - c.depth) * 0.18);
    const reach = H * c.depth * (0.55 + activity * 0.45);
    const bottomY = clamp(topY + reach, 0, H * 0.98);
    const cx = ((c.baseX + time * c.drift) % 1.2 + 1.2) % 1.2 - 0.1;
    const halfW = c.width * W * (0.7 + activity * 0.6);
    const centerX = cx * W;

    const amp = 14 + activity * 70; // ripple amplitude of the hanging top edge
    const steps = 26;

    // Folded-sheet shape: a wavy top edge, vertical sides, flat-ish bottom.
    ctx.beginPath();
    ctx.moveTo(centerX - halfW, bottomY);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = centerX - halfW + f * halfW * 2;
      const wave =
        Math.sin(f * Math.PI * c.freq + c.phase + time * 1.1) * amp +
        Math.sin(f * Math.PI * c.freq * 2.3 + time * 1.7) * amp * 0.35;
      ctx.lineTo(x, topY + wave);
    }
    ctx.lineTo(centerX + halfW, bottomY);
    ctx.closePath();

    // Vertical gradient: bright green-cyan at top, into magenta when active /
    // southward Bz, fading fully transparent at the bottom (a hanging curtain).
    const hue = c.hue - south * 70; // push toward magenta/violet under tension
    const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
    const a = 0.10 + activity * 0.42;
    grad.addColorStop(0, `hsla(${hue + 12}, 90%, 72%, ${a * (0.6 + level * 0.6)})`);
    grad.addColorStop(0.18, `hsla(${hue}, 95%, 58%, ${a})`);
    grad.addColorStop(0.55, `hsla(${hue - 18}, 90%, 45%, ${a * 0.5})`);
    grad.addColorStop(1, `hsla(${hue - 40}, 90%, 40%, 0)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function draw(s: WindSample, level: number, dtMs: number) {
    time += dtMs / 1000;

    const kpN = norm(s.kp, 0, 9);
    const speedN = norm(s.speed, 300, 750);
    const densN = norm(s.density, 0, 25);
    const south = clamp(-s.bz / 18, 0, 1);
    // Overall geomagnetic "activity" the curtains respond to.
    const activity = clamp(kpN * 0.6 + south * 0.3 + densN * 0.2 + speedN * 0.15, 0, 1);

    drawSky();
    drawStars();

    // Additive blending so overlapping sheets glow where they cross.
    ctx.globalCompositeOperation = "lighter";
    // Faster wind = livelier sideways flow.
    const flow = speedN * 0.012;
    for (const c of curtains) {
      c.phase += flow;
      drawCurtain(c, activity, south, level);
    }
    ctx.globalCompositeOperation = "source-over";

    // A soft horizon glow that intensifies during a storm.
    const glow = ctx.createLinearGradient(0, H, 0, H * 0.5);
    glow.addColorStop(0, `hsla(${150 - south * 60}, 80%, 55%, ${0.05 + activity * 0.22})`);
    glow.addColorStop(1, "hsla(150, 80%, 55%, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);
  }

  return { resize, draw };
}
