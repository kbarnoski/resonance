"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PondAudio } from "./audio";
import { FluidGPU, hasWebGPU, type FingerInput, type PondStats } from "./fluid-gpu";
import { FluidGL } from "./gl-fallback";

type Backend = "webgpu" | "webgl2" | "none";

export default function JellyPondPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const blobCanvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [backend, setBackend] = useState<Backend>("none");
  const [booting, setBooting] = useState(false);

  // refs that the rAF loop reads (avoid re-renders)
  const audioRef = useRef<PondAudio | null>(null);
  const gpuRef = useRef<FluidGPU | null>(null);
  const glRef = useRef<FluidGL | null>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastTouchRef = useRef(0);

  // finger state in CSS px relative to canvas
  const fingerRef = useRef({ x: 0, y: 0, px: 0, py: 0, active: false, vx: 0, vy: 0 });
  const demoRef = useRef({ t: 0 });

  const simWRef = useRef(220);
  const simHRef = useRef(220);
  const sizeRef = useRef({ w: 1, h: 1 });

  // draw the GPU/GL particle field as warm glowing metaballs on the 2D overlay.
  // For WebGL2 the gl canvas itself shows particles; we still paint the calm
  // pond gradient + sun-glint vignette on the overlay for both backends.
  const drawOverlay = useCallback(
    (positions: Float32Array, stats: PondStats, isGPU: boolean) => {
      const cv = blobCanvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      const sw = simWRef.current;
      const sh = simHRef.current;

      ctx.clearRect(0, 0, w, h);

      // sunlit pond base: warm amber center fading to teal-green water
      const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, w * 0.62);
      g.addColorStop(0, "#1d4f49");
      g.addColorStop(0.55, "#11403c");
      g.addColorStop(1, "#0a2622");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.47, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.47, 0, Math.PI * 2);
      ctx.clip();

      if (isGPU) {
        // additive glowing blobs from GPU positions -> sunlit water metaballs
        ctx.globalCompositeOperation = "lighter";
        const sx = w / sw;
        const sy = h / sh;
        const n = positions.length / 2;
        const r = Math.max(7, w * 0.018);
        // teal body
        for (let i = 0; i < n; i += 2) {
          const x = positions[i * 2] * sx;
          const y = positions[i * 2 + 1] * sy;
          const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, "rgba(60,190,165,0.16)");
          rg.addColorStop(1, "rgba(60,190,165,0)");
          ctx.fillStyle = rg;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }

      // amber sun-glints that brighten with stir/peak motion
      const glint = 0.12 + stats.peak * 0.5;
      ctx.globalCompositeOperation = "lighter";
      const sun = ctx.createRadialGradient(
        w * 0.42, h * 0.36, 0, w * 0.42, h * 0.36, w * 0.5,
      );
      sun.addColorStop(0, `rgba(255,206,120,${glint})`);
      sun.addColorStop(0.4, `rgba(255,180,90,${glint * 0.4})`);
      sun.addColorStop(1, "rgba(255,180,90,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);

      // ripple ring under the finger / ghost finger
      const f = fingerRef.current;
      if (f.active) {
        const fx = (f.x / sizeRef.current.w) * w;
        const fy = (f.y / sizeRef.current.h) * h;
        ctx.strokeStyle = `rgba(255,224,160,${0.35 + stats.stir * 0.4})`;
        ctx.lineWidth = 3;
        const rr = 26 * (w / sw) * (1 + stats.pool * 0.4);
        ctx.beginPath();
        ctx.arc(fx, fy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    },
    [],
  );

  const loop = useCallback(
    (now: number) => {
      if (!runningRef.current) return;
      const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 1 / 60;
      lastTimeRef.current = now;

      const f = fingerRef.current;
      // auto-demo: after ~2s idle a ghost finger stirs the pond
      let active = f.active;
      let fx = f.x;
      let fy = f.y;
      let fvx = f.vx;
      let fvy = f.vy;
      const idle = now - lastTouchRef.current;
      if (!f.active && idle > 2000) {
        demoRef.current.t += dt;
        const t = demoRef.current.t;
        const { w, h } = sizeRef.current;
        const cx = w * 0.5;
        const cy = h * 0.5;
        const R = Math.min(w, h) * 0.22;
        const gx = cx + Math.cos(t * 1.2) * R;
        const gy = cy + Math.sin(t * 1.7) * R * 0.8;
        fvx = (gx - fx) / Math.max(dt, 1e-3);
        fvy = (gy - fy) / Math.max(dt, 1e-3);
        fx = gx;
        fy = gy;
        active = true;
        f.x = fx;
        f.y = fy;
      }

      // convert finger CSS px -> sim space
      const { w, h } = sizeRef.current;
      const sw = simWRef.current;
      const sh = simHRef.current;
      const finger: FingerInput = {
        x: (fx / w) * sw,
        y: (fy / h) * sh,
        active,
        vx: (fvx / w) * sw,
        vy: (fvy / h) * sh,
      };
      // clamp finger velocity so no scary transients
      const maxV = 320;
      const fvmag = Math.hypot(finger.vx, finger.vy);
      if (fvmag > maxV) {
        finger.vx = (finger.vx / fvmag) * maxV;
        finger.vy = (finger.vy / fvmag) * maxV;
      }

      const gpu = gpuRef.current;
      const gl = glRef.current;

      const after = (stats: PondStats, positions: Float32Array, isGPU: boolean) => {
        audioRef.current?.update({
          stir: stats.stir,
          pool: stats.pool,
          peak: stats.peak,
          splash: stats.splash > 0,
          splashStrength: stats.splash,
        });
        if (!isGPU) gl?.render();
        drawOverlay(positions, stats, isGPU);
        // decay finger velocity each frame
        f.vx *= 0.6;
        f.vy *= 0.6;
        if (runningRef.current) rafRef.current = requestAnimationFrame(loop);
      };

      if (gpu) {
        gpu
          .step(finger, dt)
          .then((stats) => after(stats, gpu.positions, true))
          .catch(() => {
            if (runningRef.current) rafRef.current = requestAnimationFrame(loop);
          });
      } else if (gl) {
        const stats = gl.step(finger, dt);
        after(stats, gl.positions, false);
      } else {
        if (runningRef.current) rafRef.current = requestAnimationFrame(loop);
      }
    },
    [drawOverlay],
  );

  const resize = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    sizeRef.current = { w, h };
    for (const cv of [glCanvasRef.current, blobCanvasRef.current]) {
      if (!cv) continue;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
    }
    const blob = blobCanvasRef.current?.getContext("2d");
    blob?.setTransform(dpr, 0, 0, dpr, 0, 0);
    glRef.current?.resize(
      Math.floor(w * dpr),
      Math.floor(h * dpr),
    );
  }, []);

  const start = useCallback(async () => {
    if (started || booting) return;
    setBooting(true);
    // pre-init audio on the gesture (iOS requirement) — no spinner, instant
    try {
      const audio = new PondAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      // audio failed; continue visuals only
    }

    resize();

    let chosen: Backend = "none";
    if (hasWebGPU()) {
      try {
        const gpu = new FluidGPU();
        const ok = await gpu.init();
        if (ok) {
          gpuRef.current = gpu;
          simWRef.current = gpu.simW;
          simHRef.current = gpu.simH;
          chosen = "webgpu";
        } else {
          gpu.destroy();
        }
      } catch {
        chosen = "none";
      }
    }
    if (chosen === "none") {
      const cv = glCanvasRef.current;
      if (cv) {
        const gl = new FluidGL();
        if (gl.initGL(cv)) {
          glRef.current = gl;
          simWRef.current = gl.simW;
          simHRef.current = gl.simH;
          gl.resize(cv.width, cv.height);
          chosen = "webgl2";
        } else {
          gl.destroy();
        }
      }
    }

    setBackend(chosen);
    setStarted(true);
    setBooting(false);

    // center finger as a starting point for the demo
    const { w, h } = sizeRef.current;
    fingerRef.current.x = w * 0.5;
    fingerRef.current.y = h * 0.5;
    lastTouchRef.current = performance.now() - 2200; // demo can begin promptly

    if (chosen !== "none") {
      runningRef.current = true;
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [started, booting, resize, loop]);

  // pointer handlers
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !started) return;

    const toLocal = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const down = (e: PointerEvent) => {
      const p = toLocal(e);
      const f = fingerRef.current;
      f.px = p.x;
      f.py = p.y;
      f.x = p.x;
      f.y = p.y;
      f.vx = 0;
      f.vy = 0;
      f.active = true;
      lastTouchRef.current = performance.now();
      demoRef.current.t = 0;
      wrap.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const f = fingerRef.current;
      if (!f.active) return;
      const p = toLocal(e);
      f.vx = p.x - f.x;
      f.vy = p.y - f.y;
      f.px = f.x;
      f.py = f.y;
      f.x = p.x;
      f.y = p.y;
      lastTouchRef.current = performance.now();
    };
    const up = (e: PointerEvent) => {
      const f = fingerRef.current;
      f.active = false;
      lastTouchRef.current = performance.now();
      demoRef.current.t = 0;
      try {
        wrap.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };

    wrap.addEventListener("pointerdown", down);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
    return () => {
      wrap.removeEventListener("pointerdown", down);
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerup", up);
      wrap.removeEventListener("pointercancel", up);
    };
  }, [started]);

  // resize listener
  useEffect(() => {
    if (!started) return;
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [started, resize]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      gpuRef.current?.destroy();
      glRef.current?.destroy();
      void audioRef.current?.close();
      gpuRef.current = null;
      glRef.current = null;
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06201c] text-white">
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 rounded-full bg-black/40 px-4 py-2.5 font-mono text-base text-white/80 backdrop-blur min-h-[44px] flex items-center hover:text-white"
      >
        ← pond
      </Link>

      <div
        ref={wrapRef}
        className="absolute inset-0 touch-none select-none"
        style={{ touchAction: "none" }}
      >
        {/* WebGL2 fallback canvas (particles) */}
        <canvas
          ref={glCanvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ display: backend === "webgl2" ? "block" : "none" }}
        />
        {/* 2D overlay: pond gradient + GPU metaballs + sun-glints + ripple */}
        <canvas ref={blobCanvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#06201c]/80 px-6 text-center backdrop-blur">
          <h1 className="text-2xl font-semibold text-white">Sing the Pond</h1>
          <p className="max-w-md text-base text-white/80">
            Drag your finger across the water. The water swirls, swells, and
            sings — every wiggle is a friendly sound.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={booting}
            className="min-h-[72px] min-w-[72px] rounded-full bg-amber-300 px-10 py-5 text-2xl font-bold text-[#06201c] shadow-lg transition hover:bg-amber-200 active:scale-95"
          >
            ▶ Play
          </button>
          <p className="font-mono text-base text-white/75">touch the water to play</p>
        </div>
      )}

      {/* status / notice */}
      {started && backend === "none" && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-black/50 px-5 py-3 text-center text-base text-rose-300 backdrop-blur">
          Your device can&apos;t draw the water, but the pond is still singing —
          listen and drag.
        </div>
      )}
      {started && backend !== "none" && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/30 px-4 py-2 font-mono text-base text-white/75 backdrop-blur">
          {backend === "webgpu" ? "WebGPU fluid" : "WebGL2 water"} · drag to play
        </div>
      )}
    </main>
  );
}
