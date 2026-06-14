"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEngine,
  type Engine,
  BOWL_FREQS,
  NUM_BOWLS,
} from "./audio";

// Bold saturated per-bowl colors — color is the language for kids.
// Left->right follows the rising water row; lowest pitch bowl is the fullest.
const BOWL_COLORS: { core: string; glow: string; water: string }[] = [
  { core: "#ff5fa2", glow: "#ff8fc2", water: "#ff7ab0" }, // rose
  { core: "#ff9e3d", glow: "#ffc27a", water: "#ffb15c" }, // amber
  { core: "#ffe14d", glow: "#fff29a", water: "#ffe873" }, // yellow
  { core: "#5be37a", glow: "#9af4ad", water: "#7aec96" }, // green
  { core: "#3dc9ff", glow: "#8fe2ff", water: "#5fd6ff" }, // sky
  { core: "#a07bff", glow: "#c6aaff", water: "#b491ff" }, // violet
];

type Ripple = { bowl: number; t0: number; strength: number };

type BowlGeom = { cx: number; cy: number; r: number };

type ActivePointer = {
  bowl: number; // bowl currently under finger (or -1)
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  speed: number; // smoothed px/ms
  isTap: boolean; // hasn't moved much yet -> candidate tap
  downTime: number;
  moved: number; // accumulated movement
};

export default function SingingWaterPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [started, setStarted] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Mutable render/interaction state — driven from refs, never per-frame setState.
  const geomRef = useRef<BowlGeom[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const pointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const lastInteractRef = useRef<number>(0);

  // ----- Geometry: lay out six big, well-spaced bowls in a row -----
  const layout = useCallback((w: number, h: number) => {
    const margin = Math.min(w * 0.06, 48);
    const usable = w - margin * 2;
    const gap = usable / NUM_BOWLS;
    // Bowls big: radius from gap but capped for tall screens.
    const r = Math.min(gap * 0.42, h * 0.18, 130);
    const cy = h * 0.55;
    const geom: BowlGeom[] = [];
    for (let i = 0; i < NUM_BOWLS; i++) {
      const cx = margin + gap * (i + 0.5);
      geom.push({ cx, cy, r: Math.max(48, r) });
    }
    geomRef.current = geom;
  }, []);

  // Which bowl (if any) is under a point.
  const bowlAt = useCallback((x: number, y: number): number => {
    const geom = geomRef.current;
    for (let i = 0; i < geom.length; i++) {
      const g = geom[i];
      const dx = x - g.cx;
      const dy = y - g.cy;
      // Generous hit radius (touch-friendly).
      if (dx * dx + dy * dy <= (g.r * 1.25) * (g.r * 1.25)) return i;
    }
    return -1;
  }, []);

  // ----- Drawing -----
  const drawScene = useCallback(
    (
      cx2d: CanvasRenderingContext2D,
      w: number,
      h: number,
      now: number,
      engine: Engine | null,
    ) => {
      // Ambient water background — slow drifting gradient + caustic bands.
      cx2d.clearRect(0, 0, w, h);
      const bg = cx2d.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#06121f");
      bg.addColorStop(0.55, "#081a2c");
      bg.addColorStop(1, "#04101a");
      cx2d.fillStyle = bg;
      cx2d.fillRect(0, 0, w, h);

      // Soft moving ambient ripples across whole surface.
      cx2d.save();
      cx2d.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const yy =
          h * 0.5 +
          Math.sin(now * 0.00018 + i * 1.7) * h * 0.22 +
          i * 6;
        const grad = cx2d.createLinearGradient(0, yy - 60, 0, yy + 60);
        grad.addColorStop(0, "rgba(40,90,140,0)");
        grad.addColorStop(0.5, "rgba(50,120,180,0.05)");
        grad.addColorStop(1, "rgba(40,90,140,0)");
        cx2d.fillStyle = grad;
        cx2d.fillRect(0, yy - 60, w, 120);
      }
      cx2d.restore();

      const geom = geomRef.current;
      const ripples = ripplesRef.current;

      // Draw each bowl.
      for (let i = 0; i < geom.length; i++) {
        const g = geom[i];
        const col = BOWL_COLORS[i % BOWL_COLORS.length];
        const glow = engine ? engine.getGlow(i) : 0; // 0..1 loudness

        // Water level -> pitch: more full = lower pitch. Lowest-freq bowl = fullest.
        // Map this bowl's freq within the row to a fill fraction (inverse).
        const fMin = BOWL_FREQS[0];
        const fMax = BOWL_FREQS[BOWL_FREQS.length - 1];
        const norm = (BOWL_FREQS[i] - fMin) / (fMax - fMin || 1);
        const fill = 0.85 - norm * 0.5; // higher pitch -> less water

        // Outer bloom that swells while singing.
        cx2d.save();
        cx2d.globalCompositeOperation = "lighter";
        const bloomR = g.r * (1.5 + glow * 0.9);
        const bloom = cx2d.createRadialGradient(
          g.cx,
          g.cy,
          g.r * 0.3,
          g.cx,
          g.cy,
          bloomR,
        );
        const a = 0.18 + glow * 0.5;
        bloom.addColorStop(0, hexA(col.glow, a));
        bloom.addColorStop(1, hexA(col.glow, 0));
        cx2d.fillStyle = bloom;
        cx2d.beginPath();
        cx2d.arc(g.cx, g.cy, bloomR, 0, Math.PI * 2);
        cx2d.fill();
        cx2d.restore();

        // Vessel rim.
        cx2d.lineWidth = Math.max(3, g.r * 0.06);
        cx2d.strokeStyle = hexA(col.glow, 0.85);
        cx2d.beginPath();
        cx2d.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
        cx2d.stroke();

        // Glass body (faint).
        const body = cx2d.createRadialGradient(
          g.cx - g.r * 0.3,
          g.cy - g.r * 0.3,
          g.r * 0.1,
          g.cx,
          g.cy,
          g.r,
        );
        body.addColorStop(0, hexA(col.core, 0.18));
        body.addColorStop(1, hexA(col.core, 0.05));
        cx2d.fillStyle = body;
        cx2d.beginPath();
        cx2d.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
        cx2d.fill();

        // Water inside (clipped circle), with surface line near the top of fill.
        cx2d.save();
        cx2d.beginPath();
        cx2d.arc(g.cx, g.cy, g.r * 0.93, 0, Math.PI * 2);
        cx2d.clip();
        const waterTop = g.cy + g.r * (1 - 2 * fill);
        const wg = cx2d.createLinearGradient(0, waterTop, 0, g.cy + g.r);
        wg.addColorStop(0, hexA(col.water, 0.55));
        wg.addColorStop(1, hexA(col.water, 0.85));
        cx2d.fillStyle = wg;
        cx2d.fillRect(g.cx - g.r, waterTop, g.r * 2, g.r * 2);

        // Standing-wave caustic shimmer on the surface, tracks rub speed (glow).
        if (glow > 0.02) {
          cx2d.globalCompositeOperation = "lighter";
          const bands = 5;
          for (let b = 0; b < bands; b++) {
            const phase = now * (0.004 + glow * 0.01) + b * 1.3;
            const amp = g.r * 0.06 * glow;
            const yline =
              waterTop + (b / bands) * (g.cy + g.r - waterTop) * 0.9 + 4;
            cx2d.beginPath();
            for (let xx = -g.r; xx <= g.r; xx += 6) {
              const yy =
                yline +
                Math.sin(xx * 0.06 + phase) * amp +
                Math.sin(xx * 0.13 - phase * 1.4) * amp * 0.5;
              if (xx === -g.r) cx2d.moveTo(g.cx + xx, yy);
              else cx2d.lineTo(g.cx + xx, yy);
            }
            cx2d.strokeStyle = hexA("#ffffff", 0.06 + glow * 0.22);
            cx2d.lineWidth = 1.5;
            cx2d.stroke();
          }
        }
        cx2d.restore();

        // Surface highlight line.
        cx2d.strokeStyle = hexA("#ffffff", 0.25 + glow * 0.4);
        cx2d.lineWidth = 2;
        cx2d.beginPath();
        const wt = g.cy + g.r * (1 - 2 * fill);
        const half = Math.sqrt(Math.max(0, g.r * g.r - (wt - g.cy) * (wt - g.cy))) * 0.92;
        cx2d.moveTo(g.cx - half, wt);
        cx2d.lineTo(g.cx + half, wt);
        cx2d.stroke();
      }

      // Ripples from taps (concentric, expanding, fading).
      cx2d.save();
      cx2d.globalCompositeOperation = "lighter";
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const g = geom[rp.bowl];
        if (!g) {
          ripples.splice(i, 1);
          continue;
        }
        const age = (now - rp.t0) / 1000;
        if (age > 1.6) {
          ripples.splice(i, 1);
          continue;
        }
        const col = BOWL_COLORS[rp.bowl % BOWL_COLORS.length];
        for (let k = 0; k < 3; k++) {
          const rr = g.r * (0.4 + (age * 1.4 + k * 0.22) * 1.6);
          const alpha = Math.max(0, (1 - age / 1.6)) * 0.4 * rp.strength - k * 0.06;
          if (alpha <= 0) continue;
          cx2d.strokeStyle = hexA(col.glow, alpha);
          cx2d.lineWidth = Math.max(1.5, g.r * 0.05 * (1 - age));
          cx2d.beginPath();
          cx2d.arc(g.cx, g.cy, rr, 0, Math.PI * 2);
          cx2d.stroke();
        }
      }
      cx2d.restore();

      // "You're rubbing" glow following each active finger.
      cx2d.save();
      cx2d.globalCompositeOperation = "lighter";
      pointersRef.current.forEach((p) => {
        if (p.bowl < 0) return;
        const col = BOWL_COLORS[p.bowl % BOWL_COLORS.length];
        const fr = 18 + Math.min(40, p.speed * 18);
        const fg = cx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, fr);
        fg.addColorStop(0, hexA(col.glow, 0.6));
        fg.addColorStop(1, hexA(col.glow, 0));
        cx2d.fillStyle = fg;
        cx2d.beginPath();
        cx2d.arc(p.x, p.y, fr, 0, Math.PI * 2);
        cx2d.fill();
      });
      cx2d.restore();
    },
    [],
  );

  // ----- Main render loop + audio bridge -----
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx2d = canvas.getContext("2d");
    if (!cx2d) {
      setUnsupported(true);
      return;
    }

    let raf = 0;
    let mounted = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      cx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout(w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    // Idle auto-demo: virtual finger rubs a rim; occasional tap.
    const demo = {
      bowl: 0,
      angle: 0,
      nextTapAt: 0,
    };

    const frame = (now: number) => {
      if (!mounted) return;
      const engine = engineRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Feed rub speeds from real pointers into the engine.
      const pts = pointersRef.current;
      if (engine) {
        pts.forEach((p) => {
          if (p.bowl >= 0 && p.speed > 0.02) {
            engine.setRubSpeed(p.bowl, p.speed);
          }
          // decay smoothed speed when not moving
          p.speed *= 0.9;
        });
      }

      // Idle auto-demo if no interaction for ~2.5s and no live pointers.
      const idle = now - lastInteractRef.current > 2500 && pts.size === 0;
      if (idle && engine) {
        const geom = geomRef.current;
        const g = geom[demo.bowl];
        if (g) {
          demo.angle += 0.06;
          const px = g.cx + Math.cos(demo.angle) * g.r * 0.7;
          const py = g.cy + Math.sin(demo.angle) * g.r * 0.7;
          // gentle simulated rub speed
          engine.setRubSpeed(demo.bowl, 0.9 + Math.sin(now * 0.002) * 0.3);
          // show the ghost finger glow
          pts.set(-999, {
            bowl: demo.bowl,
            x: px,
            y: py,
            lastX: px,
            lastY: py,
            lastTime: now,
            speed: 1,
            isTap: false,
            downTime: now,
            moved: 0,
          });
          if (now > demo.nextTapAt) {
            const tapBowl = (demo.bowl + 3) % NUM_BOWLS;
            engine.tap(tapBowl);
            ripplesRef.current.push({ bowl: tapBowl, t0: now, strength: 0.8 });
            demo.nextTapAt = now + 2600 + Math.random() * 1500;
            demo.bowl = (demo.bowl + 1) % NUM_BOWLS;
            demo.angle = 0;
          }
        }
      } else {
        // Clear the ghost demo finger once real interaction resumes.
        pts.delete(-999);
      }

      drawScene(cx2d, w, h, now, engine);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [started, layout, drawScene]);

  // ----- Pointer interaction (multi-touch via pointerId) -----
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      lastInteractRef.current = performance.now();
      const { x, y } = pos(e);
      const bowl = bowlAt(x, y);
      const now = performance.now();
      pointersRef.current.set(e.pointerId, {
        bowl,
        x,
        y,
        lastX: x,
        lastY: y,
        lastTime: now,
        speed: 0,
        isTap: true,
        downTime: now,
        moved: 0,
      });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      lastInteractRef.current = performance.now();
      const { x, y } = pos(e);
      const now = performance.now();
      const dt = Math.max(1, now - p.lastTime);
      const dx = x - p.lastX;
      const dy = y - p.lastY;
      const dist = Math.hypot(dx, dy);
      const instSpeed = dist / dt; // px/ms
      // Smooth the speed for stable friction tracking.
      p.speed = p.speed * 0.6 + instSpeed * 0.4;
      p.moved += dist;
      if (p.moved > 10) p.isTap = false; // it's a rub now
      p.x = x;
      p.y = y;
      p.lastX = x;
      p.lastY = y;
      p.lastTime = now;
      const bowl = bowlAt(x, y);
      p.bowl = bowl;
      const engine = engineRef.current;
      if (engine && bowl >= 0 && !p.isTap) {
        engine.setRubSpeed(bowl, p.speed);
      }
    };

    const endPointer = (e: PointerEvent) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return;
      const now = performance.now();
      lastInteractRef.current = now;
      // Quick contact with little movement => TAP (ring the bell).
      const engine = engineRef.current;
      if (engine && p.isTap && p.bowl >= 0 && now - p.downTime < 500) {
        engine.tap(p.bowl);
        ripplesRef.current.push({ bowl: p.bowl, t0: now, strength: 1 });
      }
      pointersRef.current.delete(e.pointerId);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
    };
  }, [started, bowlAt]);

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ----- Start gate (iOS unlock inside the gesture) -----
  const begin = useCallback(async () => {
    const engine = createEngine();
    if (!engine) {
      setUnsupported(true);
      return;
    }
    engineRef.current = engine;
    await engine.resume();
    lastInteractRef.current = performance.now();
    setStarted(true);
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04101a] text-white touch-none select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Six glowing water bowls. Tap to ring, rub to sing."
      />

      {/* Decorative title (never gates play) */}
      {started && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 flex flex-col items-center pt-5">
          <h1 className="font-serif text-2xl text-white/95 drop-shadow">
            Singing Water
          </h1>
          <p className="mt-1 text-base text-white/75">
            tap to ring • rub to sing
          </p>
        </div>
      )}

      {/* Read the design notes (nice-to-have, never blocks layout) */}
      {started && (
        <button
          onClick={() => setShowNotes(true)}
          className="absolute bottom-4 right-4 rounded-full bg-white/10 px-4 py-2.5 text-base text-white/75 backdrop-blur hover:bg-white/20"
        >
          notes
        </button>
      )}

      {/* Start gate */}
      {!started && !unsupported && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#06121f] to-[#04101a] px-6 text-center">
          <div>
            <h1 className="font-serif text-3xl text-white/95 sm:text-4xl">
              Singing Water
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-white/75">
              A row of glowing bowls. Tap to ring them like bells. Rub a finger
              round and round to make them sing.
            </p>
          </div>
          <button
            onClick={begin}
            className="rounded-full bg-sky-400/90 px-10 py-6 text-2xl font-semibold text-[#04101a] shadow-lg shadow-sky-500/30 transition active:scale-95"
          >
            Tap to begin
          </button>
          <p className="text-base text-white/55">turn your sound on 🔊</p>
        </div>
      )}

      {/* Unsupported notice */}
      {unsupported && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#04101a] px-6 text-center">
          <h1 className="font-serif text-2xl text-white/95">Singing Water</h1>
          <p className="max-w-md text-base text-white/75">
            This little instrument needs a browser with Web Audio and Canvas. Try
            a recent Safari, Chrome, or Firefox.
          </p>
        </div>
      )}

      {/* Notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-2xl bg-[#0a1c2e] p-6 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-white/95">Design notes</h2>
            <p className="mt-3 text-base text-white/80">
              Each bowl is one resonator excited two ways. A{" "}
              <span className="text-sky-300">tap</span> strikes it like an
              inharmonic glass bell. A{" "}
              <span className="text-emerald-300/95">rub</span> drives a sustained
              glass-armonica friction tone — filtered noise through a high-Q
              bandpass whose loudness, brightness and focus track how fast you
              rub.
            </p>
            <p className="mt-3 text-base text-white/75">
              Tuned to a just-intonation Lydian row over F. More water means a
              lower tone — real physics you can hear. Inspired by the Indian{" "}
              <span className="text-amber-300/95">Jal Tarang</span> and Benjamin
              Franklin&apos;s glass armonica (1761).
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 rounded-full bg-white/10 px-4 py-2.5 text-base text-white/80 hover:bg-white/20"
            >
              close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// Convert "#rrggbb" + alpha(0..1) to an rgba() string.
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
