"use client";

import { useEffect, useRef } from "react";

/**
 * PARTICLE RESOLVE — a crisp element (the Resonance logo, a journey title) is
 * BORN from particles and DISSOLVES back into them, the way the field forms
 * Ghost's angel at a flash (Karel 2026-10-07: "those particles need to get
 * super detailed to become the regular logo then dissipate it kind of like
 * you have done at times with the angel image and flash with particle …
 * each journey title should integrate particles too").
 *
 *   gather   motes stream in from the dark and converge on the exact pixels
 *   resolve  they tighten (jitter → 0, motes shrink) and the REAL element
 *            fades in underneath them, the motes thinning to a faint shimmer
 *   hold     the crisp element; a few motes still breathe on it
 *   release  the element hands back to full motes in place, which then lift
 *            and curl away, dimming
 *
 * Targets are sampled from the element itself: an <svg> slot is rasterized
 * from its own paths; a text slot is drawn with its computed font, so the
 * motes land on the very glyphs that appear. The component drives the
 * element's opacity — it is invisible until the particles resolve it.
 */

interface Props {
  /** CSS selector of the crisp element to resolve (svg or single-line text). */
  slot: string;
  /** Hand the element back to particles and dissipate. */
  release: boolean;
  /** Seconds from mount until the crisp element starts to resolve. */
  resolveAt?: number;
  zIndex?: number;
  /** Release automatically this many seconds after mount (title cards). */
  releaseAfter?: number;
}

interface Mote {
  tx: number; ty: number; x: number; y: number; vx: number; vy: number;
  a: number; size: number; seed: number; delay: number;
}

const ss = (e0: number, e1: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

/** Rasterize the element at its on-screen size → filled pixel coords (px, rect-relative). */
function sampleElement(el: HTMLElement | SVGElement, rect: DOMRect): Array<[number, number]> | null {
  const S = 2; // sample at 2× for detail
  const w = Math.ceil(rect.width * S), h = Math.ceil(rect.height * S);
  if (w < 4 || h < 4 || w * h > 4_000_000) return null;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.fillStyle = g.strokeStyle = "#fff";
  if (el instanceof SVGSVGElement) {
    const vb = el.viewBox.baseVal;
    const sw = parseFloat(el.getAttribute("stroke-width") ?? "1.5");
    g.scale(w / (vb?.width || 24), h / (vb?.height || 24));
    g.lineWidth = sw;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const p of el.querySelectorAll("path")) g.stroke(new Path2D(p.getAttribute("d") ?? ""));
  } else {
    const cs = getComputedStyle(el);
    const fontPx = parseFloat(cs.fontSize);
    const text = (el.textContent ?? "").trim();
    // single-line only — a wrapped title would mis-place the glyphs
    if (!text || rect.height > fontPx * 1.9) return null;
    g.scale(S, S);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const m = g.measureText(text);
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    // inline layout: the content box is centred in the line box
    const baseline = (rect.height - (asc + desc)) / 2 + asc;
    g.fillText(text, rect.width / 2, baseline);
  }
  const px = g.getImageData(0, 0, w, h).data;
  const hits: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 110) hits.push([x / S, y / S]);
  return hits;
}

export function ParticleResolve({ slot, release, resolveAt = 2.4, zIndex = 123, releaseAfter }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const releaseRef = useRef(release);
  releaseRef.current = release;

  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let el: HTMLElement | SVGElement | null = null;
    let motes: Mote[] = [];
    let origin = { x: 0, y: 0 }; // element rect top-left, canvas-relative
    let centre = { x: 0, y: 0 };
    let start = -1;
    let releasedAt = -1;
    let crispAtRelease = 0;
    let last = performance.now();
    let raf = 0;
    let fallback = false;

    const setCrisp = (o: number) => { if (el) el.style.opacity = o.toFixed(3); };

    const init = (): boolean => {
      const found = document.querySelector<HTMLElement | SVGElement>(slot);
      if (!found) return false;
      const rect = found.getBoundingClientRect();
      if (rect.width < 2) return false;
      el = found;
      el.style.transition = "none";
      const hits = sampleElement(found, rect);
      if (!hits || hits.length < 20) { fallback = true; return true; } // can't sample → plain fade
      const cr = cv.getBoundingClientRect();
      origin = { x: rect.left - cr.left, y: rect.top - cr.top };
      centre = { x: origin.x + rect.width / 2, y: origin.y + rect.height / 2 };
      // dense enough to READ as the element: ~1 mote per 1.6 lit px, capped
      const N = Math.max(1400, Math.min(7000, Math.round(hits.length / 1.2)));
      const cx = rect.width / 2, cy = rect.height / 2;
      const span = Math.max(rect.width, rect.height, 420); // arrive from afar, never a clump
      motes = Array.from({ length: N }, () => {
        const [tx, ty] = hits[Math.floor(Math.random() * hits.length)];
        const ang = Math.random() * Math.PI * 2;
        const r = span * (0.5 + Math.random() * 0.9);
        return {
          tx: tx + (Math.random() - 0.5) * 0.5, ty: ty + (Math.random() - 0.5) * 0.5,
          x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.6, vx: 0, vy: 0,
          a: 0, size: 0.32 + Math.random() * 0.45, /* fine motes: they DRAW the detail */ seed: Math.random() * 1000, delay: Math.random() * 0.8,
        };
      });
      return true;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!el && !init()) { raf = requestAnimationFrame(frame); return; }
      if (start < 0) { start = now; setCrisp(0); }
      const t = (now - start) / 1000;
      // the slot can MOVE (logo screen → set card): motes glide to the new box
      if (el && releasedAt < 0 && !fallback) {
        const now2 = document.querySelector<HTMLElement | SVGElement>(slot);
        if (now2 && now2 !== el) {
          const a = el.getBoundingClientRect(), b = now2.getBoundingClientRect();
          if (b.width > 1) {
            origin = { x: origin.x + b.left - a.left, y: origin.y + b.top - a.top };
            centre = { x: centre.x + b.left - a.left, y: centre.y + b.top - a.top };
            now2.style.transition = "none";
            el = now2;
          }
        }
      }
      if ((releaseRef.current || (releaseAfter !== undefined && t > releaseAfter)) && releasedAt < 0) {
        releasedAt = now;
        crispAtRelease = parseFloat(el?.style.opacity || "0") || 0;
      }
      const rel = releasedAt < 0 ? -1 : (now - releasedAt) / 1000;

      // the crisp element: resolves out of the motes, hands back on release
      const crispIn = ss(resolveAt, resolveAt + 1.2, t);
      const crisp = rel < 0 ? crispIn : crispAtRelease * (1 - ss(0, 0.9, rel));
      setCrisp(fallback ? (rel < 0 ? ss(0.4, 2.2, t) : crispAtRelease * (1 - ss(0, 1.2, rel))) : crisp);
      if (fallback) {
        if (rel > 1.5) return;
        raf = requestAnimationFrame(frame);
        return;
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
      g.globalCompositeOperation = "lighter";
      const tight = ss(resolveAt - 1.2, resolveAt + 0.8, t); // 0 = loose gather, 1 = exact
      let alive = 0;
      for (const m of motes) {
        const gx = origin.x + m.tx, gy = origin.y + m.ty;
        if (rel < 0.35) {
          // GATHER → RESOLVE (and the first beat of the release: motes back in place)
          const k = ss(m.delay, m.delay + 2.0, t);
          const jit = (1 - tight) * 2.2 + 0.25;
          const tx = gx + Math.sin(t * 1.1 + m.seed) * jit;
          const ty = gy + Math.cos(t * 0.9 + m.seed * 1.3) * jit;
          const stiff = 3 + 14 * k * k + 30 * tight;
          const damp = 4.2 + 3 * tight;
          m.vx += ((tx - m.x) * stiff - m.vx * damp) * dt;
          m.vy += ((ty - m.y) * stiff - m.vy * damp) * dt;
          // motes thin to a shimmer once the crisp element carries the form;
          // on release they return to full so the hand-back is seamless
          const veil = rel >= 0 ? 1 : 1 - 0.82 * crisp;
          const want = Math.min(1, k * 1.3) * veil * (0.8 + 0.2 * Math.sin(t * 1.7 + m.seed));
          m.a += (want - m.a) * Math.min(1, dt * (rel >= 0 ? 8 : 3));
        } else {
          // WISP: lift + curl outward, staggered, dimming away
          const r = Math.max(0, rel - 0.35 - m.delay * 0.9);
          if (r > 0) {
            const dx = m.x - centre.x, dy = m.y - centre.y;
            const curl = Math.sin(m.seed + r * 1.7 + dy * 0.02) * 24;
            m.vx += (dx * 0.3 + curl - m.vx * 0.6) * dt;
            m.vy += (-34 + Math.cos(m.seed * 0.7 + r * 1.3 + dx * 0.02) * 16 - m.vy * 0.6) * dt;
            m.a *= Math.exp(-dt * 0.9);
          } else { m.vx *= Math.exp(-dt * 6); m.vy *= Math.exp(-dt * 6); }
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.a < 0.01) continue;
        alive++;
        const sz = m.size * (1.6 - 0.7 * tight) * (rel > 0.35 ? 1.25 : 1);
        g.fillStyle = `rgba(232,238,255,${(m.a * 0.42).toFixed(3)})`;
        g.beginPath();
        g.arc(m.x, m.y, sz, 0, Math.PI * 2);
        g.fill();
      }
      if (rel > 1 && alive === 0) { g.clearRect(0, 0, cv.width / dpr, cv.height / dpr); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [slot, resolveAt, releaseAfter]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex, width: "100%", height: "100%" }}
      aria-hidden
    />
  );
}
