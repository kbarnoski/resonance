"use client";

import { useEffect, useRef } from "react";

/**
 * The Resonance mark drawn in PARTICLES (Karel 2026-10-07: "the resonance
 * title screen should just be resonance with the logo and integrate the
 * particle system to make the logo be particles and whisp away as it
 * transitions to the journey. and when it fades in integrate particles").
 *
 * Motes GATHER out of the dark into the mark (the fade-in), breathe while the
 * title holds, then WISP AWAY — drifting up and outward on a soft curl and
 * dimming over ~3.5 s — when the intro hands off to the journey.
 *
 * A full-screen canvas above the intro layers (their opacity fades would
 * otherwise swallow the wisp); it follows whichever `[data-mark-slot]` box is
 * active, so the text layout still owns placement.
 */

// the same four strokes as <ResonanceMark> (24-unit viewBox)
const MARK_PATHS = [
  "M12 3C12 3 12 8 12 12C12 16 12 21 12 21",
  "M12 7C14.5 7 16.5 5.5 16.5 3.5",
  "M12 12C9 12 6.5 10 6.5 7.5",
  "M12 17C15 17 17.5 15 17.5 12.5",
];

interface Mote {
  tx: number; ty: number; // target in mark units (0..1)
  x: number; y: number; vx: number; vy: number;
  a: number; size: number; seed: number; delay: number;
}

function sampleMark(n: number): Array<[number, number]> {
  const R = 240;
  const c = document.createElement("canvas");
  c.width = c.height = R;
  const g = c.getContext("2d");
  if (!g) return [];
  g.scale(R / 24, R / 24);
  g.lineWidth = 1.7;
  g.lineCap = "round";
  g.strokeStyle = "#fff";
  for (const d of MARK_PATHS) g.stroke(new Path2D(d));
  const px = g.getImageData(0, 0, R, R).data;
  const hits: Array<[number, number]> = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) if (px[(y * R + x) * 4 + 3] > 90) hits.push([x / R, y / R]);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n && hits.length; i++) {
    const [hx, hy] = hits[Math.floor(Math.random() * hits.length)];
    out.push([hx + (Math.random() - 0.5) / R, hy + (Math.random() - 0.5) / R]);
  }
  return out;
}

export function ParticleMark({ release }: { release: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const releaseRef = useRef(release);
  releaseRef.current = release;

  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const N = 1600;
    const motes: Mote[] = sampleMark(N).map(([tx, ty]) => {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.45; // scattered wide (viewport fractions)
      return {
        tx, ty,
        x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.7, vx: 0, vy: 0,
        a: 0, size: 0.6 + Math.random() * 1.3, seed: Math.random() * 1000, delay: Math.random() * 0.9,
      };
    });
    let rect = { cx: window.innerWidth / 2, cy: window.innerHeight / 2 - 80, s: 120 };
    const start = performance.now();
    let releasedAt = -1;
    let last = start;
    let raf = 0;
    let firstPlaced = false;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = document.querySelector<HTMLElement>('[data-mark-slot="active"]');
      if (el && !releaseRef.current) {
        const b = el.getBoundingClientRect();
        if (b.width > 0) {
          // the particle mark reads a little larger than the old 80 px glyph
          rect = { cx: b.left + b.width / 2, cy: b.top + b.height / 2, s: b.width * 1.5 };
          if (!firstPlaced) {
            firstPlaced = true;
            // scatter is relative to the mark centre: convert viewport fractions → px offsets
            for (const m of motes) { m.x = rect.cx + m.x * window.innerWidth; m.y = rect.cy + m.y * window.innerHeight; }
          }
        }
      }
      if (!firstPlaced) { raf = requestAnimationFrame(frame); return; }
      if (releaseRef.current && releasedAt < 0) releasedAt = now;
      const t = (now - start) / 1000;
      const rel = releasedAt < 0 ? -1 : (now - releasedAt) / 1000;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, window.innerWidth, window.innerHeight);
      g.globalCompositeOperation = "lighter";
      let alive = 0;
      for (const m of motes) {
        if (rel < 0) {
          // GATHER: spring toward the mark, staggered; then breathe in place
          const k = Math.max(0, Math.min(1, (t - m.delay) / 2.6));
          const tx = rect.cx + (m.tx - 0.5) * rect.s + Math.sin(t * 0.9 + m.seed) * 0.9;
          const ty = rect.cy + (m.ty - 0.5) * rect.s + Math.cos(t * 0.7 + m.seed * 1.3) * 0.9;
          const stiff = 2.2 + 6 * k * k;
          m.vx += ((tx - m.x) * stiff - m.vx * 3.4) * dt;
          m.vy += ((ty - m.y) * stiff - m.vy * 3.4) * dt;
          m.a += (Math.min(1, k * 1.4) * (0.75 + 0.25 * Math.sin(t * 1.3 + m.seed)) - m.a) * Math.min(1, dt * 3);
        } else {
          // WISP: lift + curl outward, each mote on its own delay, dimming away
          const r = Math.max(0, rel - m.delay * 0.8);
          const dx = m.x - rect.cx, dy = m.y - rect.cy;
          const curl = Math.sin(m.seed + r * 1.7 + dy * 0.02) * 26;
          m.vx += (dx * 0.35 + curl - m.vx * 0.6) * dt;
          m.vy += (-38 - Math.abs(dx) * 0.08 + Math.cos(m.seed * 0.7 + r * 1.3 + dx * 0.02) * 18 - m.vy * 0.6) * dt;
          m.a *= Math.exp(-dt * (r > 0 ? 0.95 : 0));
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.a < 0.01) continue;
        alive++;
        g.fillStyle = `rgba(226,234,255,${(m.a * 0.6).toFixed(3)})`;
        g.beginPath();
        g.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        g.fill();
      }
      if (rel > 1 && alive === 0) return; // fully wisped away — stop drawing
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 123, width: "100%", height: "100%" }}
      aria-hidden
    />
  );
}
