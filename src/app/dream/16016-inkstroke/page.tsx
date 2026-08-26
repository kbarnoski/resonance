"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { makeInk, makeCpuInk, type InkField, type CpuInk } from "./ink";
import { makeBow, type Bow } from "./bow";
import { AutoStroke } from "./stroke";

// Curated selector — a few of Karel's VERIFIED tracks (ids sourced from
// REAL_TRACKS, never invented). Default: Welcome Home's "Welcome Home".
const DEFAULT_ID = "8dafed88-4761-4dd3-a0f4-93f310441093";
const CURATED_IDS = new Set([
  "8dafed88-4761-4dd3-a0f4-93f310441093", // Welcome Home
  "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", // Isolation
  "d57cfae6-f234-4d24-85fe-72a8ad93a44a", // Interplay
  "eba95845-cdbf-41d8-9c5d-8679686811ad", // Bath
  "1f0a541e-df60-44a9-b839-5dc69a007d9f", // 2019
  "734a09ce-84df-4f1f-93c1-11b08d303681", // Snowflake
]);
const TRACKS = REAL_TRACKS.filter((t) => CURATED_IDS.has(t.id));

const IDLE_MS = 1600; // quiet before the auto-demo resumes
const SIM_SIZE = 512;

type Mode = "webgl2" | "canvas2d" | "";

export default function InkstrokePage() {
  const [trackId, setTrackId] = useState(DEFAULT_ID);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bowRef = useRef<Bow | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const inkRef = useRef<InkField | null>(null);
  const cpuInkRef = useRef<CpuInk | null>(null);

  const rafRef = useRef<number>(0);
  const drawingRef = useRef(false);
  const lastPointerRef = useRef(0);
  const lastPtRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastSplatRef = useRef<{ x: number; y: number } | null>(null);
  const autoRef = useRef<AutoStroke | null>(null);
  const audioLevelRef = useRef(0);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reducedRef = useRef(false);

  /* ── deposit ink + bow the take for one stroke point (screen-norm, y-down) ── */
  const applyPoint = useCallback(
    (nx: number, nyScreen: number, pressure: number, speed: number) => {
      // brush footprint: fatter under pressure, thinner when fast
      const radius = (0.012 + pressure * 0.032) * (1 - 0.4 * speed);
      const strength = (0.16 + pressure * 0.4) * (1 - 0.3 * speed);

      const ink = inkRef.current;
      const cpu = cpuInkRef.current;
      const last = lastSplatRef.current;
      // interpolate along the segment so fast strokes stay continuous
      const dab = (x: number, yScreen: number) => {
        if (ink) ink.splat(x, 1 - yScreen, radius, strength);
        else if (cpu) cpu.splat(x, yScreen, radius, strength);
      };
      if (last) {
        const dx = nx - last.x;
        const dy = nyScreen - last.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.min(24, Math.round(dist / 0.01)));
        for (let i = 1; i <= steps; i++) {
          dab(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
        }
      } else {
        dab(nx, nyScreen);
      }
      lastSplatRef.current = { x: nx, y: nyScreen };

      bowRef.current?.setStroke({
        scrub: nx,
        speed,
        pressure,
        pan: nyScreen * 2 - 1,
        active: true,
      });
    },
    [],
  );

  /* ── pointer → stroke (pressure + speed) ──────────────────────────────── */
  const onPointer = useCallback(
    (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const now = performance.now();
      lastPointerRef.current = now;

      const prev = lastPtRef.current;
      let speed = 0;
      if (prev) {
        const dt = Math.max(1, now - prev.t) / 1000;
        const dist = Math.hypot(nx - prev.x, ny - prev.y);
        speed = Math.min(1, dist / dt / 1.4); // ~1.4 paper-widths/s → full
      }
      lastPtRef.current = { x: nx, y: ny, t: now };

      // pressure: real pen pressure, else derive from slowness/dwell
      let pressure = e.pressure;
      if (e.pointerType !== "pen" || !pressure) {
        pressure = Math.min(0.85, Math.max(0.12, 0.8 - speed * 0.6));
      }
      applyPoint(nx, ny, pressure, speed);
    },
    [applyPoint],
  );

  /* ── load a buffer + build the bow ────────────────────────────────────── */
  const buildBow = useCallback(
    async (ctx: AudioContext, safe: SafeMaster, id: string) => {
      const { buffer, title: t } = await loadRealTrackBuffer(ctx, id);
      const bow = makeBow(ctx, buffer, safe.input);
      bow.start();
      bowRef.current = bow;
      setTitle(t);
    },
    [],
  );

  /* ── start ────────────────────────────────────────────────────────────── */
  const handlePlay = useCallback(async () => {
    if (playing || loading) return;
    setError("");
    setLoading(true);
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ctx: AudioContext;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      setError("This device would not start audio.");
      setLoading(false);
      return;
    }
    ctxRef.current = ctx;
    const safe = createSafeMaster(ctx);
    safeRef.current = safe;
    freqRef.current = new Uint8Array(
      new ArrayBuffer(safe.analyser.frequencyBinCount),
    );

    // graphics: WebGL2 float field, else Canvas2D dabs
    let m: Mode = "";
    const glCanvas = glCanvasRef.current;
    if (glCanvas) {
      const gl = glCanvas.getContext("webgl2", {
        antialias: false,
        depth: false,
        stencil: false,
        alpha: false,
      });
      if (gl) {
        const ink = makeInk(gl, SIM_SIZE);
        if (ink) {
          glRef.current = gl;
          inkRef.current = ink;
          m = "webgl2";
          glCanvas.addEventListener(
            "webglcontextlost",
            (ev: Event) => {
              ev.preventDefault();
              setError("The graphics context was lost — please reload.");
            },
            { once: true },
          );
        }
      }
    }
    if (m !== "webgl2") {
      cpuInkRef.current = makeCpuInk();
      m = "canvas2d";
    }
    setMode(m);

    try {
      await buildBow(ctx, safe, trackId);
    } catch {
      setError(
        "Karel's recording would not load just now — the paper stays live; try Play again.",
      );
      // keep the visual alive even without audio
    }

    autoRef.current = new AutoStroke(performance.now(), reducedRef.current);
    lastPointerRef.current = performance.now() - IDLE_MS * 2; // auto-demo first
    setLoading(false);
    setPlaying(true);
  }, [playing, loading, trackId, buildBow]);

  /* ── stop ─────────────────────────────────────────────────────────────── */
  const handleStop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    bowRef.current?.dispose();
    bowRef.current = null;
    inkRef.current?.dispose();
    inkRef.current = null;
    cpuInkRef.current?.dispose();
    cpuInkRef.current = null;
    const gl = glRef.current;
    if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
    glRef.current = null;
    safeRef.current?.disconnect();
    safeRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    lastSplatRef.current = null;
    lastPtRef.current = null;
    setPlaying(false);
    setMode("");
  }, []);

  /* ── the render + auto-demo loop ──────────────────────────────────────── */
  useEffect(() => {
    if (!playing) return;
    const wrap = wrapRef.current;
    const glCanvas = glCanvasRef.current;
    const cpuCanvas = cpuCanvasRef.current;
    if (!wrap) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width * dpr));
      const h = Math.max(1, Math.floor(r.height * dpr));
      if (mode === "webgl2" && glCanvas) {
        glCanvas.width = w;
        glCanvas.height = h;
      }
      if (mode === "canvas2d" && cpuCanvas) {
        cpuCanvas.width = w;
        cpuCanvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const move = (e: PointerEvent) => {
      if (drawingRef.current) onPointer(e);
    };
    const down = (e: PointerEvent) => {
      drawingRef.current = true;
      lastPtRef.current = null;
      lastSplatRef.current = null;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onPointer(e);
    };
    const up = () => {
      drawingRef.current = false;
      lastSplatRef.current = null;
      lastPtRef.current = null;
      bowRef.current?.setStroke({ active: false });
    };
    wrap.addEventListener("pointerdown", down);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointerleave", up);
    wrap.addEventListener("pointercancel", up);

    const steps = reducedRef.current ? 1 : 2;

    const loop = () => {
      const now = performance.now();

      // audio energy (breathes the wet cores)
      const safe = safeRef.current;
      const freq = freqRef.current;
      if (safe && freq) {
        safe.analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < freq.length; i++) sum += freq[i];
        const lvl = sum / freq.length / 255;
        audioLevelRef.current += (lvl - audioLevelRef.current) * 0.15;
      }
      const audio = Math.min(1, audioLevelRef.current * 2.2);

      // auto-demo when the pointer has been quiet
      if (!drawingRef.current && now - lastPointerRef.current > IDLE_MS) {
        const auto = autoRef.current;
        if (auto) {
          const s = auto.sample(now);
          if (s.drawing) {
            const spd = reducedRef.current ? 0.25 : 0.45;
            applyPoint(s.x, s.y, s.pressure, spd);
          } else {
            lastSplatRef.current = null;
            bowRef.current?.setStroke({ active: false });
          }
        }
      }

      const ink = inkRef.current;
      const cpu = cpuInkRef.current;
      if (ink && glCanvas) {
        ink.step(steps, audio);
        ink.draw(glCanvas.width, glCanvas.height, audio);
      } else if (cpu && cpuCanvas) {
        cpu.step(steps, audio);
        const c2d = cpuCanvas.getContext("2d");
        if (c2d) cpu.draw(c2d, cpuCanvas.width, cpuCanvas.height, audio);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", down);
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerup", up);
      wrap.removeEventListener("pointerleave", up);
      wrap.removeEventListener("pointercancel", up);
    };
  }, [playing, mode, onPointer, applyPoint]);

  /* ── teardown on unmount ──────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      bowRef.current?.dispose();
      inkRef.current?.dispose();
      cpuInkRef.current?.dispose();
      safeRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · dream lab
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Inkstroke
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          A calligraphic pen-stroke bows Karel&apos;s real piano take — the brush
          scrubs and re-voices his actual recording as grains, while the same
          stroke lays living indigo ink that bleeds and feathers across bone
          paper.
        </p>

        {/* controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">
              Take
            </span>
            <select
              value={trackId}
              disabled={playing || loading}
              onChange={(e) => setTrackId(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          {!playing ? (
            <button
              onClick={handlePlay}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "Play"}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* paper stage */}
        <div
          ref={wrapRef}
          className="relative mt-5 aspect-[4/3] w-full touch-none overflow-hidden rounded-lg border border-border"
          style={{ background: "#efe5cf" }}
        >
          {mode === "webgl2" && (
            <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
          )}
          {mode === "canvas2d" && (
            <canvas ref={cpuCanvasRef} className="absolute inset-0 h-full w-full" />
          )}
          {!playing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-base text-muted-foreground">
                Press Play. His take begins bowing itself; then draw with a pen,
                stylus, or pointer to take over the brush.
              </p>
            </div>
          )}
        </div>

        {/* status line */}
        <div className="mt-3 min-h-[1.5rem] text-sm">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : playing ? (
            <span className="text-muted-foreground">
              Bowing{" "}
              <span className="text-foreground">{title || "his take"}</span> ·{" "}
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                {mode === "webgl2"
                  ? "webgl2 ink field"
                  : "canvas2d ink fallback"}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Pen pressure and stroke speed re-voice his real recording.
            </span>
          )}
        </div>

        <div className="mt-6">
          <Link
            href="/dream"
            className="text-base text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← back to the dream lab
          </Link>
        </div>

        <PrototypeNav slugs={["16016-inkstroke"]} />
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Inkstroke — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if a
                calligraphic pen-stroke bowed Karel&apos;s real piano recording —
                the brush does not synthesize a tone, it scrubs and re-voices his
                actual take — while the same stroke lays living ink that bleeds
                across the paper?
              </p>
              <p>
                <span className="text-foreground">The bow.</span> Horizontal
                stroke position scrubs a play-head across his whole recording.
                Stroke speed sets grain density and a ±6% playback-rate lean.
                Pen pressure sets grain length (30–160 ms, Hann-windowed) and an
                &quot;ink wetness&quot; lowpass — press harder for a wetter,
                darker voice. Every grain is a short slice of his actual
                AudioBuffer; nothing is synthesized (rule&nbsp;10).
              </p>
              <p>
                <span className="text-foreground">The ink.</span> A WebGL2
                ping-pong float field deposits indigo dye along the stroke, then
                feathers it each frame — but only where the paper is still wet,
                so strokes settle and the sheet slowly dries. The freshest wet
                cores glow deep cyan; his audio energy breathes their bleed.
              </p>
              <p>
                <span className="text-foreground">Palette.</span> Prussian-blue /
                deep-indigo ink on warm bone-white paper is a deliberate third
                register — not ember/gold, not pure grayscale.
              </p>
              <p>
                <span className="text-foreground">References.</span> Calliphony
                (arXiv:2608.03040, 2026) — real-time calligraphy-driven music
                performance. Shu&nbsp;Dao: A Calligraphy Score Framework (Lican
                Huang, arXiv:2606.00001, 2026) — a brush stroke as an ordered,
                executable performative score. Reframe: here the stroke is a
                score-cursor that bows his recording; it does not generate
                calligraphy or a synth voice.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
