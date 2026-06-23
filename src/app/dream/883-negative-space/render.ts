// render.ts — Canvas2D ONLY. No WebGL, no three.js.
//
// The visual is the inversion made visible:
//   SILENCE → a luminous open field blooms outward from the center; the longer
//             you stay quiet the wider and warmer (monochrome → violet) it grows.
//   SOUND   → dark encroaching grain/static floods in from the edges and erodes
//             the light; the bloom recedes toward the always-on root glow.

export interface RenderState {
  /** 0..1 bloom level (stillness, normalized). */
  bloom: number;
  /** 0..1 duck — how much sound is currently erasing the light. */
  duck: number;
  /** monotonically increasing seconds, for slow motion. */
  time: number;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: RenderState,
) {
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // Base void — deep near-black, faintly warmer as the chord builds.
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, w, h);

  // ── The luminous bloom (negative space made visible) ──────────────────────
  // Radius grows with bloom; brightness is killed by duck.
  const light = s.bloom * (1 - s.duck);
  const baseR = minDim * (0.06 + 0.42 * s.bloom);
  const breathe = 1 + Math.sin(s.time * 0.5) * 0.04;
  const r = baseR * breathe;

  // Palette monochrome (cool white) → violet as bloom climbs.
  const hue = 250; // violet
  const sat = Math.round(20 + 55 * s.bloom);
  const lum = Math.round(70 + 18 * light);

  // Always-on root glow so it's never fully dead, even fully ducked.
  const rootGlow = 0.06;
  const inner = `hsla(${hue}, ${sat}%, ${lum}%, ${0.32 * light + rootGlow})`;
  const midCol = `hsla(${hue}, ${sat}%, ${Math.round(lum * 0.7)}%, ${
    0.16 * light + rootGlow * 0.5
  })`;
  const edge = `hsla(${hue}, ${sat}%, 8%, 0)`;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, midCol);
  grad.addColorStop(1, edge);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Soft concentric "voices" — one faint ring per partial that's lit.
  const litVoices = Math.floor(s.bloom * 6 + 0.0001);
  for (let i = 1; i <= litVoices; i++) {
    const rr = r * (0.32 + i * 0.11) * breathe;
    const a = 0.05 * light * (1 - i / 8);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${a})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  // ── Encroaching grain/static (SOUND erodes) ───────────────────────────────
  // Density scales with duck. Drawn as scattered dark+bright specks heaviest at
  // the edges, washing inward — the light recedes as noise floods.
  const grain = s.duck;
  if (grain > 0.01) {
    const count = Math.floor(900 * grain);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      // Heavier toward the edges (erosion from outside in).
      const d = Math.hypot(x - cx, y - cy) / (minDim * 0.5);
      const edgeBias = Math.min(1, d * 0.9 + 0.1);
      if (Math.random() > edgeBias) continue;
      const bright = Math.random() < 0.25;
      const a = (0.15 + Math.random() * 0.45) * grain;
      ctx.fillStyle = bright
        ? `rgba(180,170,210,${a * 0.6})`
        : `rgba(0,0,0,${a})`;
      const sz = bright ? 1 : 1 + Math.random() * 2;
      ctx.fillRect(x, y, sz, sz);
    }

    // A darkening vignette that closes in with the duck.
    const vg = ctx.createRadialGradient(
      cx,
      cy,
      minDim * (0.5 - 0.35 * grain),
      cx,
      cy,
      minDim * 0.75,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,0,${0.85 * grain})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}
