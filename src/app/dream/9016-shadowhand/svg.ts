// svg.ts — the mandatory graceful-degradation path.
//
// When navigator.gpu is absent we drive a lightweight inline-SVG field instead
// (NOT Canvas2D, NOT WebGL2 — both banned this cycle). Same two-hand idea, far
// fewer particles: ~64 <circle>s integrated in JS and written straight to DOM
// attributes each frame. Warm amber duet, same as the GPU path.

import { mulberry32, type VizState } from "./analysis";

const SVG_NS = "http://www.w3.org/2000/svg";
const N = 64; // 32 per hand
const VB = 100; // viewBox is 0..100 in both axes

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hand: 0 | 1;
  el: SVGCircleElement;
}

export interface SvgField {
  readonly backend: "SVG";
  frame(state: VizState, dt: number, reduce: boolean): void;
  destroy(): void;
}

export function createSvgField(root: SVGSVGElement): SvgField {
  root.setAttribute("viewBox", `0 0 ${VB} ${VB}`);
  root.setAttribute("preserveAspectRatio", "xMidYMid slice");
  const rnd = mulberry32(0x9016);
  const parts: P[] = [];
  for (let i = 0; i < N; i++) {
    const hand: 0 | 1 = i < N / 2 ? 0 : 1;
    const cx = hand === 0 ? 0.36 : 0.64;
    const r = 0.12 + rnd() * 0.16;
    const a = rnd() * Math.PI * 2;
    const el = document.createElementNS(SVG_NS, "circle");
    // art layer — raw color is allowed here
    el.setAttribute("fill", hand === 0 ? "#f28c2e" : "#ffd27a");
    el.setAttribute("opacity", "0.7");
    root.appendChild(el);
    parts.push({
      x: cx + Math.cos(a) * r,
      y: 0.5 + Math.sin(a) * r,
      vx: 0,
      vy: 0,
      hand,
      el,
    });
  }

  let destroyed = false;

  function frame(state: VizState, dt: number, reduce: boolean): void {
    if (destroyed) return;
    const cdt = Math.min(0.05, dt);
    const amp = reduce ? 0.4 : 1;
    const bend = (state.dominant / 12) * Math.PI * 2;
    const cb = Math.cos(bend);
    const sb = Math.sin(bend);
    for (const p of parts) {
      const cx = p.hand === 0 ? 0.36 : 0.64;
      const spin = p.hand === 0 ? 1 : -1;
      const onset = p.hand === 0 ? state.onsetA : state.onsetB;
      const tx = cx - p.x;
      const ty = 0.5 - p.y;
      // rotational flow
      const rx = -ty * spin;
      const ry = tx * spin;
      const sx = rx * cb - ry * sb;
      const sy = rx * sb + ry * cb;
      let fx = tx * 0.9 + sx * (0.9 + state.energy * 1.4) * amp;
      let fy = ty * 0.9 + sy * (0.9 + state.energy * 1.4) * amp;
      // onset burst outward
      const dx = p.x - cx;
      const dy = p.y - 0.5;
      const dl = Math.hypot(dx, dy) + 1e-3;
      fx += (dx / dl) * onset * 2.4 * amp;
      fy += (dy / dl) * onset * 2.4 * amp;
      p.vx = p.vx * 0.9 + fx * cdt;
      p.vy = p.vy * 0.9 + fy * cdt;
      p.x += p.vx * cdt;
      p.y += p.vy * cdt;
      if (p.x < 0.02) { p.x = 0.02; p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > 0.98) { p.x = 0.98; p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y < 0.02) { p.y = 0.02; p.vy = Math.abs(p.vy) * 0.5; }
      if (p.y > 0.98) { p.y = 0.98; p.vy = -Math.abs(p.vy) * 0.5; }

      const speed = Math.hypot(p.vx, p.vy);
      const rad = 0.8 + speed * 40 + onset * 1.5;
      p.el.setAttribute("cx", (p.x * VB).toFixed(2));
      p.el.setAttribute("cy", (p.y * VB).toFixed(2));
      p.el.setAttribute("r", Math.min(4, rad).toFixed(2));
      p.el.setAttribute(
        "opacity",
        (0.4 + Math.min(0.5, speed * 8 + onset * 0.4)).toFixed(2),
      );
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    for (const p of parts) p.el.remove();
  }

  return { backend: "SVG", frame, destroy };
}
