"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WebGpuPlate, type PlateParams } from "./webgpu-plate";
import { GlRenderer, Canvas2dRenderer, type PlateLayout } from "./render";
import { makeAudioRig, type AudioRig, type CpuTuning } from "./audio";

// ── Plate roster ────────────────────────────────────────────────────────────
// Four hanging plates of decreasing stiffness (kappa) -> descending fundamental,
// with size/decay scaled to feel physical. The point is timbre, not harmony:
// these are "tuned-ish" but the pitch droop & ring come from the physics.
type PlateDef = {
  label: string;
  params: PlateParams;
  size: number; // relative visual size
};

// kappa sets the fundamental (descending across the row); beta is the non-linear
// tension-modulation strength (the pitch-bloom). Base k2 = kappa^2 stays well
// below the explicit-scheme stability clamp (0.052) so only a very hard strike
// brushes the limit. s0 = frequency-independent damping (overall ring length);
// s1 = frequency-dependent damping (bright highs fade first).
const PLATES: PlateDef[] = [
  { label: "I",   params: { kappa: 0.200, s0: 0.000034, s1: 0.00060, beta: 0.55 }, size: 0.84 },
  { label: "II",  params: { kappa: 0.176, s0: 0.000030, s1: 0.00055, beta: 0.60 }, size: 0.92 },
  { label: "III", params: { kappa: 0.152, s0: 0.000026, s1: 0.00050, beta: 0.65 }, size: 1.00 },
  { label: "IV",  params: { kappa: 0.130, s0: 0.000022, s1: 0.00045, beta: 0.70 }, size: 1.08 },
];

const CPU_TUNINGS: CpuTuning[] = PLATES.map((p) => ({
  kappa: p.params.kappa, s0: p.params.s0, s1: p.params.s1, beta: p.params.beta,
}));

type PathKind = "gpu" | "cpu" | "audio-none";
type GlKind = "webgl2" | "canvas2d";

export default function ModalAnvilPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [pathLabel, setPathLabel] = useState("detecting…");
  const [audioWarning, setAudioWarning] = useState<string | null>(null);
  const [autoDemo, setAutoDemo] = useState(true);

  // mutable engine refs (never re-create React state in the hot loop)
  const rigRef = useRef<AudioRig | null>(null);
  const gpuPlatesRef = useRef<WebGpuPlate[]>([]);
  const glRef = useRef<GlRenderer | null>(null);
  const c2dRef = useRef<Canvas2dRenderer | null>(null);
  const pathRef = useRef<PathKind>("cpu");
  const glKindRef = useRef<GlKind>("canvas2d");
  const rafRef = useRef<number>(0);
  const energiesRef = useRef<number[]>(PLATES.map(() => 0));
  const glowsRef = useRef<number[]>(PLATES.map(() => 0));
  const cpuFieldsRef = useRef<(Float32Array | null)[]>(PLATES.map(() => null));
  const cpuGridRef = useRef<number>(34);
  const lastInteractRef = useRef<number>(0);
  const ghostTimerRef = useRef<number>(0);
  const ghostIdxRef = useRef<number>(0);
  const startedRef = useRef(false);
  const autoDemoRef = useRef(true);
  const ratioSetRef = useRef(false);

  // plate hit-region layouts, recomputed on resize
  const layoutsRef = useRef<PlateLayout[]>([]);

  const recomputeLayouts = useCallback((grid: number) => {
    const n = PLATES.length;
    const slotW = 1 / n;
    const layouts: PlateLayout[] = PLATES.map((p, i) => {
      const cx = slotW * (i + 0.5);
      const cy = 0.52;
      const w = slotW * 0.82 * p.size;
      const h = w * 1.05; // canvas aspect handled in draw via pixel sizes
      return { cx, cy, w, h, grid };
    });
    layoutsRef.current = layouts;
  }, []);

  // strike a plate (routes to whichever engine is live)
  const strikePlate = useCallback((index: number, nx: number, ny: number, force: number) => {
    glowsRef.current[index] = Math.min(1, glowsRef.current[index] + force);
    const path = pathRef.current;
    if (path === "gpu") {
      gpuPlatesRef.current[index]?.strike(nx, ny, force);
    } else if (path === "cpu") {
      rigRef.current?.cpuNodes[index]?.port.postMessage({ type: "strike", x: nx, y: ny, force });
    }
  }, []);

  // map a pointer event to (plateIndex, local nx, ny)
  const hitTest = useCallback((clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    const layouts = layoutsRef.current;
    for (let i = 0; i < layouts.length; i++) {
      const L = layouts[i];
      const left = L.cx - L.w / 2, right = L.cx + L.w / 2;
      const top = L.cy - L.h / 2, bot = L.cy + L.h / 2;
      if (px >= left && px <= right && py >= top && py <= bot) {
        const nx = (px - left) / (right - left);
        const ny = (py - top) / (bot - top);
        return { index: i, nx, ny };
      }
    }
    return null;
  }, []);

  // ── boot the engines (inside a user gesture) ──────────────────────────────
  const boot = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    lastInteractRef.current = performance.now();

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- decide audio path ----
    let path: PathKind = "cpu";
    const hasWorklet = typeof AudioContext !== "undefined" &&
      "audioWorklet" in AudioContext.prototype;
    const hasGpu = typeof navigator !== "undefined" && !!navigator.gpu;

    // ---- pick render path ----
    let glKind: GlKind = "canvas2d";
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    } catch { gl = null; }

    // ---- try WebGPU sim ----
    let gpuOk = false;
    if (hasGpu) {
      try {
        const adapter = await navigator.gpu!.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice();
          const plates = PLATES.map((p) => new WebGpuPlate(device, p.params));
          gpuPlatesRef.current = plates;
          gpuOk = true;
        }
      } catch {
        gpuOk = false;
      }
    }

    const simGrid = gpuOk ? gpuPlatesRef.current[0].grid : cpuGridRef.current;

    // ---- renderer ----
    if (gl) {
      try {
        glRef.current = new GlRenderer(gl, PLATES.length, simGrid);
        glKind = "webgl2";
      } catch {
        glRef.current = null;
        glKind = "canvas2d";
      }
    }
    if (glKind === "canvas2d") {
      const c2d = canvas.getContext("2d");
      if (c2d) c2dRef.current = new Canvas2dRenderer(c2d, simGrid);
    }
    glKindRef.current = glKind;
    recomputeLayouts(simGrid);

    // ---- audio ----
    if (!hasWorklet) {
      path = "audio-none";
      setAudioWarning("AudioWorklet unavailable — showing the simulation muted.");
    } else {
      try {
        const useGpu = gpuOk;
        const rig = await makeAudioRig(useGpu, PLATES.length, CPU_TUNINGS);
        rigRef.current = rig;
        if (rig.ctx.state === "suspended") await rig.ctx.resume();
        path = useGpu ? "gpu" : "cpu";

        if (path === "cpu") {
          // wire cpu field messages -> visual fields
          rig.cpuNodes.forEach((node, i) => {
            node.port.onmessage = (e: MessageEvent) => {
              const d = e.data as { type: string; data?: Float32Array; N?: number; energy?: number };
              if (d.type === "field" && d.data) {
                cpuFieldsRef.current[i] = d.data;
                if (d.N) cpuGridRef.current = d.N;
                if (typeof d.energy === "number") energiesRef.current[i] = d.energy;
              }
            };
          });
        }
      } catch {
        path = "audio-none";
        setAudioWarning("Could not start audio — showing the simulation muted.");
      }
    }

    pathRef.current = path;
    setPathLabel(
      `${gpuOk ? "WebGPU plate sim" : "CPU-worklet plate sim"} · ` +
      `${glKind === "webgl2" ? "WebGL2" : "Canvas2D"} render · ` +
      `${path === "audio-none" ? "muted" : path === "gpu" ? "GPU→audio loop" : "worklet FD audio"}`,
    );

    startLoop();
    // a welcoming first strike on the centre plate
    setTimeout(() => strikePlate(2, 0.5, 0.45, 0.7), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recomputeLayouts, strikePlate]);

  // ── the animation / audio-pump loop ───────────────────────────────────────
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let last = performance.now();

    const frame = async () => {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = now - last; last = now;

      // ghost-hammer auto demo
      if (autoDemoRef.current && now - lastInteractRef.current > 2000) {
        ghostTimerRef.current += dt;
        if (ghostTimerRef.current > 1100) {
          ghostTimerRef.current = 0;
          const i = ghostIdxRef.current % PLATES.length;
          ghostIdxRef.current++;
          const force = 0.35 + Math.random() * 0.5;
          strikePlate(i, 0.4 + Math.random() * 0.2, 0.35 + Math.random() * 0.2, force);
        }
      }

      // decay glows
      for (let i = 0; i < glowsRef.current.length; i++) {
        glowsRef.current[i] *= Math.pow(0.0008, dt / 1000);
      }

      const path = pathRef.current;

      // ---- GPU path: step sim, read pickup -> worklet, read field -> render ----
      if (path === "gpu") {
        const plates = gpuPlatesRef.current;
        const rig = rigRef.current;
        // set resample ratio once: SUBSTEPS samples represent (SUBSTEPS * dtSim)
        // seconds; we generated them at ~48k. Tell worklet to read at the right
        // rate relative to the actual audio sampleRate.
        if (rig?.gpuNode && !ratioSetRef.current && rig.ctx) {
          ratioSetRef.current = true;
          rig.gpuNode.port.postMessage({ type: "ratio", value: 48000 / rig.ctx.sampleRate });
          rig.gpuNode.port.postMessage({ type: "gain", value: 0.9 });
        }
        // mix the pickup of all plates into one stream (sum)
        const blocks: (Float32Array | null)[] = [];
        for (let i = 0; i < plates.length; i++) {
          plates[i].step();
        }
        for (let i = 0; i < plates.length; i++) {
          // read pickup block + field + energy (async, one frame behind)
          const blk = await plates[i].readPickup();
          blocks.push(blk);
          void plates[i].readEnergy();
          const field = await plates[i].readField();
          energiesRef.current[i] = plates[i].getEnergy();
          if (field) {
            if (glKindRef.current === "webgl2") glRef.current?.uploadField(i, field);
            else cpuFieldsRef.current[i] = field;
          }
        }
        // sum pickup blocks and ship to the worklet ring buffer
        if (rig?.gpuNode) {
          let len = 0;
          for (const b of blocks) if (b && b.length > len) len = b.length;
          if (len > 0) {
            const mix = new Float32Array(len);
            for (const b of blocks) {
              if (!b) continue;
              for (let k = 0; k < b.length; k++) mix[k] += b[k] * 60; // pickup gain
            }
            rig.gpuNode.port.postMessage({ type: "samples", data: mix }, [mix.buffer]);
          }
        }
      }

      // ---- render ----
      drawScene(now);
    };

    const drawScene = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      const W = Math.max(1, Math.floor(cssW * dpr));
      const H = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
      }
      const layouts = layoutsRef.current;
      if (glKindRef.current === "webgl2" && glRef.current) {
        // CPU path uploads happen here (GPU path uploaded in loop already only
        // for webgl2; but if CPU+webgl2, upload now)
        if (pathRef.current !== "gpu") {
          for (let i = 0; i < layouts.length; i++) {
            const f = cpuFieldsRef.current[i];
            if (f) glRef.current.uploadField(i, f);
          }
        }
        glRef.current.draw(layouts, energiesRef.current, glowsRef.current, now / 1000, W, H);
      } else if (c2dRef.current) {
        c2dRef.current.draw(layouts, cpuFieldsRef.current, energiesRef.current, W, H);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
  }, [strikePlate]);

  // ── pointer striking with velocity-based force ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastMove: { x: number; y: number; t: number } | null = null;

    const onDown = (e: PointerEvent) => {
      lastInteractRef.current = performance.now();
      if (autoDemoRef.current) { setAutoDemo(false); autoDemoRef.current = false; }
      if (!startedRef.current) { void boot(); return; }
      const hit = hitTest(e.clientX, e.clientY, canvas);
      if (!hit) return;
      // force from recent pointer velocity, else from vertical position
      let force = 0.55;
      if (lastMove) {
        const dt = Math.max(1, performance.now() - lastMove.t);
        const v = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt;
        force = Math.max(0.25, Math.min(1, 0.3 + v * 2.2));
      } else {
        force = Math.max(0.25, Math.min(1, 0.25 + (1 - hit.ny) * 0.9));
      }
      strikePlate(hit.index, hit.nx, hit.ny, force);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      lastMove = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
    };
  }, [boot, hitTest, strikePlate]);

  // ── teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const p of gpuPlatesRef.current) p.destroy();
      gpuPlatesRef.current = [];
      glRef.current?.destroy();
      glRef.current = null;
      void rigRef.current?.destroy();
      rigRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0b0e] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: started ? "crosshair" : "pointer" }}
      />

      {/* back link */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 text-sm text-white/75 hover:text-white"
      >
        ← dream lab
      </Link>

      {/* design notes link */}
      <a
        href="https://github.com/"
        onClick={(e) => e.preventDefault()}
        title="See README.md in this prototype's folder for the technique & references"
        className="absolute right-4 top-4 z-20 cursor-help text-sm text-white/55 hover:text-white/80"
      >
        design notes
      </a>

      {/* hero overlay (pre-start) */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Modal Anvil
          </h1>
          <p className="max-w-xl text-base text-white/75 sm:text-lg">
            A glowing metal plate, simulated in real time. The sound you hear is the
            literal motion of a finite-difference vibrating plate — strike it hard and the
            pitch blooms bright, then glides downward as it rings. No samples. No notes.
          </p>
          <button
            onClick={() => void boot()}
            className="min-h-[44px] rounded-md bg-amber-500/90 px-6 py-2.5 text-base font-medium text-[#1a1206] shadow-lg shadow-amber-900/40 transition hover:bg-amber-400"
          >
            Strike the anvil
          </button>
          <p className="text-sm text-white/55">
            Or just wait — the forge strikes itself.
          </p>
        </div>
      )}

      {/* running HUD */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[80vw] space-y-1">
          <p className="text-sm text-amber-300/95">Modal Anvil</p>
          <p className="text-sm text-white/55">{pathLabel}</p>
          {autoDemo && (
            <p className="text-sm text-white/55">ghost hammer active — strike a plate to take over</p>
          )}
          {audioWarning && <p className="text-sm text-rose-300">{audioWarning}</p>}
        </div>
      )}

      {/* plate labels */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-around px-[6%]">
          {PLATES.map((p) => (
            <span key={p.label} className="text-sm text-white/55">{p.label}</span>
          ))}
        </div>
      )}
    </main>
  );
}
