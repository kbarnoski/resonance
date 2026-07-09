// ─────────────────────────────────────────────────────────────────────────────
// fluid.ts — a Canvas2D "wet-plate" liquid-light engine (deliberately NOT WebGL).
//
// The look is built from a coarse DYE ADVECTION on a small offscreen buffer:
//
//   1. Each frame the previous buffer is re-drawn onto a scratch buffer, shifted
//      slightly along the flow (tilt) vector and faded a touch — so every pool
//      SMEARS and drifts downhill like oil pushed across a hot projector plate.
//   2. A handful of colored emitters (magenta / cyan / amber / violet) drift with
//      the flow and re-inject translucent radial gradients with 'lighter'
//      (additive), so pools bloom, merge, and separate. A faint complementary
//      outer ring gives the thin-film iridescent edge.
//   3. The buffer is upscaled with smoothing onto the visible canvas over near-
//      black, then a vignette caps corner brightness.
//
// SAFETY: the per-frame fade is a hard multiplicative decay, so additive glow can
// never run away to a full-white flash. Bloom is smooth continuous luminance
// drift — no strobe. A shallow ≤0.3 Hz breath modulates injection only.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

interface Emitter {
  x: number; // 0..1 in buffer space
  y: number;
  color: RGB;
  edge: RGB; // iridescent thin-film rim
  phase: number; // personal drift phase
  drift: number; // personal drift speed
}

const BUF_W = 200; // small buffer → coarse, oily, cheap

// saturated oil-slick psychedelic pools on near-black
const EMITTERS: Emitter[] = [
  { x: 0.32, y: 0.36, color: [255, 40, 170], edge: [70, 210, 255], phase: 0.0, drift: 0.7 },
  { x: 0.68, y: 0.4, color: [40, 210, 255], edge: [255, 120, 60], phase: 1.7, drift: 0.5 },
  { x: 0.5, y: 0.66, color: [255, 170, 40], edge: [180, 60, 255], phase: 3.1, drift: 0.9 },
  { x: 0.28, y: 0.68, color: [170, 60, 255], edge: [80, 255, 180], phase: 4.6, drift: 0.6 },
  { x: 0.72, y: 0.7, color: [80, 255, 140], edge: [255, 60, 200], phase: 5.5, drift: 0.8 },
];

export interface Fluid {
  step(flowX: number, flowY: number, heat: number, reduced: boolean, dt: number): void;
  render(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): void;
}

export function makeFluid(aspect: number): Fluid {
  const bufW = BUF_W;
  const bufH = Math.max(80, Math.round(BUF_W / Math.max(0.5, aspect)));

  const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement("canvas");
    c.width = bufW;
    c.height = bufH;
    const g = c.getContext("2d");
    if (!g) throw new Error("2d context unavailable");
    return [c, g];
  };

  let [canvasA, ctxA] = make();
  let [canvasB, ctxB] = make();

  // seed a faint resting churn so it is never dead
  ctxA.fillStyle = "#000";
  ctxA.fillRect(0, 0, bufW, bufH);

  const ems = EMITTERS.map((e) => ({ ...e }));
  let time = 0;

  const step: Fluid["step"] = (flowX, flowY, heat, reduced, dt) => {
    time += dt;
    const h = Math.min(1, Math.max(0, heat));

    // ── advect: redraw A onto B, shifted along flow, faded ────────────────────
    // displacement in buffer pixels; hotter pours push harder
    const push = (0.9 + h * 3.2) * (reduced ? 0.5 : 1);
    const dx = flowX * push;
    const dy = flowY * push;
    // a whisper of zoom + swirl so pools churn even when the flow is small
    const swirl = reduced ? 0.0009 : 0.0022;
    const zoom = 1 + swirl;
    const cx = bufW / 2;
    const cy = bufH / 2;
    const decay = reduced ? 0.955 : 0.93 + h * 0.03; // hotter holds a longer smear

    ctxB.clearRect(0, 0, bufW, bufH);
    ctxB.globalCompositeOperation = "source-over";
    ctxB.globalAlpha = decay;
    ctxB.save();
    ctxB.translate(dx, dy);
    // scale about the buffer centre for the slow churn
    ctxB.translate(cx, cy);
    ctxB.scale(zoom, zoom);
    ctxB.translate(-cx, -cy);
    ctxB.drawImage(canvasA, 0, 0);
    ctxB.restore();
    ctxB.globalAlpha = 1;

    // ── re-inject the colored pools additively ────────────────────────────────
    // a shallow, slow breath (≤0.3 Hz) so bloom gently swells — never a strobe
    const breath = 0.86 + 0.14 * Math.sin(time * 0.0016);
    const inject = (0.05 + h * 0.11) * breath;
    const radius = bufH * (0.22 + h * 0.16);

    ctxB.globalCompositeOperation = "lighter";
    for (const e of ems) {
      // emitters drift with the flow (pushed downhill) + personal wander
      const wander = reduced ? 0.5 : 1;
      e.x += (flowX * 0.0016 * push + Math.sin(time * 0.0004 * e.drift + e.phase) * 0.00035) * wander;
      e.y += (flowY * 0.0016 * push + Math.cos(time * 0.0005 * e.drift + e.phase) * 0.00035) * wander;
      // wrap softly so pools re-enter the plate
      if (e.x < -0.1) e.x += 1.2;
      if (e.x > 1.1) e.x -= 1.2;
      if (e.y < -0.1) e.y += 1.2;
      if (e.y > 1.1) e.y -= 1.2;

      const px = e.x * bufW;
      const py = e.y * bufH;
      const [r, g, b] = e.color;

      const grad = ctxB.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${inject.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${(inject * 0.4).toFixed(3)})`);
      // thin-film iridescent rim
      const [er, eg, eb] = e.edge;
      grad.addColorStop(0.82, `rgba(${er},${eg},${eb},${(inject * 0.16).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctxB.fillStyle = grad;
      ctxB.beginPath();
      ctxB.arc(px, py, radius, 0, Math.PI * 2);
      ctxB.fill();
    }
    ctxB.globalCompositeOperation = "source-over";

    // ── ping-pong: B becomes the new current ──────────────────────────────────
    [canvasA, canvasB] = [canvasB, canvasA];
    [ctxA, ctxB] = [ctxB, ctxA];
  };

  const render: Fluid["render"] = (ctx, cssW, cssH) => {
    // near-black plate
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#050308";
    ctx.fillRect(0, 0, cssW, cssH);

    // upscale the oil buffer with smoothing → soft, wet blur
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvasA, 0, 0, bufW, bufH, 0, 0, cssW, cssH);

    // vignette: darken corners so a hot pool never blows the frame to white
    const vg = ctx.createRadialGradient(
      cssW / 2,
      cssH / 2,
      Math.min(cssW, cssH) * 0.25,
      cssW / 2,
      cssH / 2,
      Math.max(cssW, cssH) * 0.72,
    );
    vg.addColorStop(0, "rgba(5,3,8,0)");
    vg.addColorStop(1, "rgba(5,3,8,0.82)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cssW, cssH);
  };

  return { step, render };
}
