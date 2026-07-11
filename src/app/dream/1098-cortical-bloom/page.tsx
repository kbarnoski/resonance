"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1098-cortical-bloom — geometric hallucinations, GROWN not painted.
//
// A WebGPU compute-shader excitatory/inhibitory neural field (Gray-Scott, an
// equivalent of Wilson–Cowan near its Turing instability) self-organises into
// cortical stripes / spots / honeycombs. Rendered through the retino-cortical
// complex-log map (Ermentrout & Cowan 1979; Bressloff et al. 2001), those
// cortical patterns read out as Klüver's four form constants — tunnels, spirals,
// spokes, honeycomb lattices. Field statistics drive a just-intonation drone.
// Autonomous by default; tap to seed a nucleus; slider/arrows nudge the balance.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { GpuField, requestGpu, type Splat } from "./gpu";
import { makeFieldAudio, type FieldAudio } from "./audio";
import { makeFallback, type FallbackController } from "./fallback";
import { GRID, DU, DV, DT, regimeAt, autonomousBalance, makeSeed } from "./neural";

const R_MIN = 0.05;
const R_MAX = 1.6;
const U_MIN = Math.log(R_MIN);
const RADIAL_TILES = 1.8;
const U_SPAN = (Math.log(R_MAX) - U_MIN) / RADIAL_TILES;
const VROT = 1;
const TAU = Math.PI * 2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Backend = "init" | "webgpu" | "canvas2d";

export default function CorticalBloomPage() {
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [backend, setBackend] = useState<Backend>("init");
  const [note, setNote] = useState("");
  const [audioOn, setAudioOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [sliderVal, setSliderVal] = useState(0.5);
  const [regimeLabel, setRegimeLabel] = useState("Honeycomb lattice");

  const sliderRef = useRef(0.5);
  const audioRef = useRef<FieldAudio | null>(null);
  const seedSinkRef = useRef<(nx: number, ny: number) => void>(() => {});
  const startAudioRef = useRef<() => void>(() => {});

  useEffect(() => {
    sliderRef.current = sliderVal;
  }, [sliderVal]);

  useEffect(() => {
    const gpuCanvas = gpuCanvasRef.current;
    const fbCanvas = fbCanvasRef.current;
    if (!gpuCanvas || !fbCanvas) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let disposed = false;
    let raf = 0;
    const t0 = performance.now();
    const driftRef = { v: 0 };
    const brightRef = { v: 0.95 };
    const labelRef = { v: "" };

    const audio = makeFieldAudio();
    audioRef.current = audio;

    const effectiveBalance = () =>
      clamp01(
        autonomousBalance((performance.now() - t0) / 1000, reduced) +
          (sliderRef.current - 0.5),
      );

    startAudioRef.current = () => {
      audio.resume().catch(() => {});
      setAudioOn(true);
    };

    // ── interaction: tap seeds a nucleus + blooms the audio ──────────────────
    const onPointer = (clientX: number, clientY: number, target: HTMLCanvasElement) => {
      const rect = target.getBoundingClientRect();
      const nx = clamp01((clientX - rect.left) / Math.max(1, rect.width));
      const ny = clamp01((clientY - rect.top) / Math.max(1, rect.height));
      seedSinkRef.current(nx, ny);
      if (!audio.running()) startAudioRef.current();
      audio.bloom(0.6);
    };
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      onPointer(e.clientX, e.clientY, e.currentTarget as HTMLCanvasElement);
    };
    gpuCanvas.addEventListener("pointerdown", onPointerDown);
    fbCanvas.addEventListener("pointerdown", onPointerDown);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const d = e.key === "ArrowRight" ? 0.05 : -0.05;
        const next = clamp01(sliderRef.current + d);
        sliderRef.current = next;
        setSliderVal(next);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);

    const pushRegimeLabel = (label: string) => {
      if (label !== labelRef.v) {
        labelRef.v = label;
        setRegimeLabel(label);
      }
    };

    // convert a normalised screen tap → cortical grid cell for the splat pass
    const tapToSplat = (nx: number, ny: number, canvas: HTMLCanvasElement): Splat => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const m = Math.min(W, H);
      const sx = (nx * W - 0.5 * W) / (0.5 * m);
      const sy = (ny * H - 0.5 * H) / (0.5 * m);
      const r = Math.max(Math.hypot(sx, sy), 1e-4);
      const u = Math.log(r);
      const theta = Math.atan2(sy, sx);
      const fu = (u - U_MIN) / U_SPAN + driftRef.v;
      const fv = ((theta + Math.PI) / TAU) * VROT;
      const frac = (x: number) => x - Math.floor(x);
      return {
        gx: frac(fu) * GRID,
        gy: frac(fv) * GRID,
        rad: 4.5,
        amp: 0.75,
      };
    };

    // ── Canvas2D fallback path ───────────────────────────────────────────────
    const runFallback = (msg: string) => {
      if (disposed) return;
      setBackend("canvas2d");
      setNote(msg);
      const fb: FallbackController = makeFallback(fbCanvas, {
        reducedMotion: reduced,
        getBalance: effectiveBalance,
        onStats: (mean, energy, density) => {
          const bal = effectiveBalance();
          pushRegimeLabel(regimeAt(bal).label);
          const a = audioRef.current;
          if (a && a.running()) a.setStats(mean, energy, density, 0.3 + 0.7 * bal);
        },
      });
      seedSinkRef.current = (nx, ny) => fb.seed(nx, ny);
      fb.start();
      fallbackCleanup = () => fb.stop();
    };
    let fallbackCleanup: (() => void) | null = null;

    // ── WebGPU compute path ──────────────────────────────────────────────────
    let field: GpuField | null = null;
    const runGpu = async () => {
      const seed = makeSeed(GRID);
      const init = await requestGpu(gpuCanvas);
      if (disposed) {
        init?.device.destroy();
        return;
      }
      if (!init) {
        runFallback("WebGPU unavailable — running the Canvas2D cortical field (lower resolution).");
        return;
      }
      try {
        field = new GpuField(init, gpuCanvas, GRID, seed);
      } catch (err) {
        init.device.destroy();
        runFallback(
          "WebGPU init failed — running the Canvas2D cortical field. " +
            (err instanceof Error ? err.message : ""),
        );
        return;
      }
      setBackend("webgpu");

      const gpuField = field;
      const pending: { nx: number; ny: number }[] = [];
      seedSinkRef.current = (nx, ny) => pending.push({ nx, ny });

      let last = performance.now();
      let frameCount = 0;

      const frame = () => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        const balance = effectiveBalance();
        const rg = regimeAt(balance);
        pushRegimeLabel(rg.label);

        if (pending.length) {
          const batch = pending.splice(0, 16);
          gpuField.splat(batch.map((t) => tapToSplat(t.nx, t.ny, gpuCanvas)));
        }

        const substeps = reduced ? 8 : 12;
        gpuField.step(rg.feed, rg.kill, DU, DV, DT, substeps);
        driftRef.v += dt * (reduced ? 0.015 : 0.03);

        gpuField.render({
          uMin: U_MIN,
          uSpan: U_SPAN,
          drift: driftRef.v,
          vrot: VROT,
          bright: brightRef.v,
          tint: rg.tint,
        });

        frameCount += 1;
        if (frameCount % 5 === 0) {
          gpuField.readStats((s) => {
            brightRef.v = 0.9 + 0.12 * clamp01(s.density * 6);
            const a = audioRef.current;
            if (a && a.running()) a.setStats(s.mean, s.energy, s.density, 0.3 + 0.7 * balance);
          });
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    runGpu().catch(() => {
      runFallback("WebGPU error — running the Canvas2D cortical field.");
    });

    // suppress default touch scrolling on the canvases while interacting
    const noScroll = (e: TouchEvent) => e.preventDefault();
    gpuCanvas.addEventListener("touchstart", noScroll, { passive: false });
    fbCanvas.addEventListener("touchstart", noScroll, { passive: false });

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      gpuCanvas.removeEventListener("pointerdown", onPointerDown);
      fbCanvas.removeEventListener("pointerdown", onPointerDown);
      gpuCanvas.removeEventListener("touchstart", noScroll);
      fbCanvas.removeEventListener("touchstart", noScroll);
      window.removeEventListener("keydown", onKey);
      if (fallbackCleanup) fallbackCleanup();
      field?.dispose();
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    sliderRef.current = v;
    setSliderVal(v);
  }, []);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-black">
      <canvas
        ref={gpuCanvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: backend === "canvas2d" ? "none" : "block" }}
      />
      <canvas
        ref={fbCanvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: backend === "canvas2d" ? "block" : "none" }}
      />

      {/* title */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Cortical Bloom
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Hallucination geometry, grown from a simulated sheet of excitable neurons.
        </p>
        <p className="mt-1 text-base text-violet-300">{regimeLabel}</p>
      </div>

      {/* design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-lg border border-border bg-black/50 px-4 py-2.5 text-base text-foreground backdrop-blur transition-colors hover:bg-accent"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* controls */}
      <div className="absolute bottom-6 left-1/2 z-20 w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl border border-border bg-black/55 px-5 py-4 backdrop-blur">
        {!audioOn && (
          <button
            type="button"
            onClick={() => startAudioRef.current()}
            className="mb-3 min-h-[44px] w-full rounded-lg bg-violet-500/25 px-4 py-2.5 text-base text-violet-200 transition-colors hover:bg-violet-500/40"
          >
            Turn on sound
          </button>
        )}
        <label className="block text-base text-muted-foreground">
          Excitation ↔ inhibition balance
        </label>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-base text-muted-foreground">Lattice</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sliderVal}
            onChange={onSlider}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-violet-400"
            aria-label="Excitation to inhibition balance"
          />
          <span className="text-base text-muted-foreground">Tunnels</span>
        </div>
        <p className="mt-3 text-base text-muted-foreground">
          Tap the field to seed a new bloom. Arrow keys nudge the balance. It
          evolves on its own.
        </p>
        {note && <p className="mt-2 text-base text-violet-300">{note}</p>}
      </div>

      {/* notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-black/85 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-2xl text-foreground">
            <h2 className="text-2xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-4 text-base">
              The geometric hallucinations of a psychedelic state are not painted
              here — they are <span className="text-violet-300">grown</span>. A
              sheet of excitable neurons is simulated as an excitatory–inhibitory
              neural field (a Gray-Scott activator–inhibitor, equivalent to a
              Wilson–Cowan / Amari system near its Turing instability) on a
              toroidal grid, running as a WebGPU compute shader with two
              ping-ponged storage buffers.
            </p>
            <p className="mt-4 text-base">
              Tuned near instability, the field spontaneously self-organises into
              stripes, spots and hexagons. Because the retina→V1 cortical map is
              approximately a <span className="text-violet-300">complex logarithm</span>,
              the render pass takes each screen pixel&apos;s (log r, θ) coordinate
              and samples the cortical field there. So cortical stripes read out as
              spirals &amp; tunnels and cortical hexagons as an expanding honeycomb
              — the actual Ermentrout–Cowan explanation of why hallucinations look
              the way they do.
            </p>
            <p className="mt-4 text-base">
              Three coupled subsystems: (1) the GPU compute neural-field
              simulation; (2) the log-polar retino-cortical render map; (3) an
              asynchronous read-back of field statistics (mean activity, energy,
              spatial-gradient density) that drives a just-intonation drone — denser
              patterns brighten the timbre, a slow rotating pan gives the spiral
              regime its shimmer, all through a soft limiter so it never turns
              harsh.
            </p>
            <p className="mt-4 text-base">
              A slow parameter drift walks the feed/kill balance through the four
              Klüver form constants over ~30s so it lives on its own; a tap seeds a
              fresh excitation nucleus with an audible bloom; the slider or arrow
              keys nudge the excitation/inhibition balance toward the lattice or
              tunnel pole.
            </p>
            <p className="mt-4 text-base">
              Safety: no strobe or flicker. The pattern changes over seconds, mean
              screen luminance stays roughly constant, and{" "}
              <code className="text-violet-300">prefers-reduced-motion</code> slows
              the drift further. If WebGPU is unavailable the piece degrades to a
              Canvas2D value-noise cortical field warped by the same map — never
              blank, never silent.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              Reference: Ermentrout &amp; Cowan (1979), &quot;A mathematical theory
              of visual hallucination patterns&quot;; Bressloff, Cowan, Golubitsky,
              Thomas &amp; Wiener (2001/2002) on Turing instabilities in a cortical
              neural field and the retino-cortical map.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
