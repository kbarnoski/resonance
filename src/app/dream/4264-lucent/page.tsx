"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4264 · Lucent — a living lightscape painted by Karel's piano
//
// THE ONE QUESTION: What if Karel's own piano recording generated a slowly
// evolving, dreamlike LIGHTSCAPE — a GPU flow-field the music continuously
// paints and advects — so a long performance becomes a living cloud of light
// that is materially different at minute 5 than at minute 1?
//
// The real recording is fetched on Start, decoded to an AudioBufferSourceNode
// (looping), and routed through an AnalyserNode to both the speakers and the
// visual analysis. If the fetch/decode fails we fall back to a seeded
// felt-piano synth that drives the identical analysis — the piece always sounds
// and always paints. See gl.ts for the ping-pong flow-field and deposit.ts for
// the spectral→light mapping.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { buildSpectralReader, type SpectralReader } from "./analysis";
import { buildSynthEngine, type SynthEngine } from "./synth";
import { createRenderer, type Renderer, type Stroke } from "./gl";
import { buildStrokes, makeDepositState, type DepositState } from "./deposit";
import { mulberry32, SEED } from "./rng";

const DEFAULT_UUID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

type Status = "idle" | "loading" | "running" | "error";
type AudioMode = "real" | "synth";

interface Engine {
  ctx: AudioContext;
  reader: SpectralReader;
  renderer: Renderer;
  depositState: DepositState;
  rand: () => number;
  // audio nodes (real path) — may be absent when on synth
  source: AudioBufferSourceNode | null;
  master: GainNode | null;
  synth: SynthEngine | null;
  raf: number;
  startedAt: number;
  lastFrame: number;
}

export default function LucentPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const windRef = useRef<Stroke[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<AudioMode>("real");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [uuid, setUuid] = useState<string>(DEFAULT_UUID);
  const [showNotes, setShowNotes] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgl2" | "canvas2d" | null>(null);

  // ── Teardown (idempotent) ──────────────────────────────────────────────────
  const teardown = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const eng = engineRef.current;
    if (!eng) return;
    engineRef.current = null;
    cancelAnimationFrame(eng.raf);
    try {
      eng.source?.stop();
    } catch {
      /* already stopped */
    }
    try {
      eng.source?.disconnect();
      eng.master?.disconnect();
    } catch {
      /* ok */
    }
    eng.synth?.stop();
    try {
      eng.renderer.dispose();
    } catch {
      /* ok */
    }
    // Close the AudioContext last so trailing nodes flush cleanly.
    if (eng.ctx.state !== "closed") {
      eng.ctx.close().catch(() => {});
    }
  }, []);

  // Ensure full teardown on unmount.
  useEffect(() => teardown, [teardown]);

  // ── The render loop ─────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - eng.lastFrame) / 1000 || 0.016);
    eng.lastFrame = now;
    const time = (now - eng.startedAt) / 1000;

    const frame = eng.reader.read();
    const strokes = buildStrokes(frame, eng.depositState, eng.rand, time);

    // Merge any pointer "wind" (strictly secondary; brightness 0 = pure push).
    if (windRef.current.length > 0) {
      for (const w of windRef.current) strokes.push(w);
      windRef.current = [];
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    eng.renderer.frame({ strokes, dt, time, reduced });
    eng.raf = requestAnimationFrame(runLoop);
  }, []);

  // ── Real-audio loader with seeded synth fallback ────────────────────────────
  const loadAudio = useCallback(
    async (
      ctx: AudioContext,
      id: string
    ): Promise<{
      analyser: AnalyserNode;
      audioMode: AudioMode;
      source: AudioBufferSourceNode | null;
      master: GainNode | null;
      synth: SynthEngine | null;
      msg: string;
      hardError: string;
    }> => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        if (typeof ctx.decodeAudioData !== "function") {
          throw new Error("decodeAudioData unsupported");
        }
        const metaRes = await fetch(`/api/audio/${id}`, { signal: ctrl.signal });
        if (!metaRes.ok) throw new Error(`audio API ${metaRes.status}`);
        const meta = (await metaRes.json()) as { url?: string };
        if (!meta.url) throw new Error("no url in response");

        const audioRes = await fetch(meta.url, { signal: ctrl.signal });
        if (!audioRes.ok) throw new Error(`audio file ${audioRes.status}`);
        const buf = await audioRes.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf.slice(0));

        const analyser = buildAnalyserFor(ctx);
        const master = ctx.createGain();
        master.gain.setValueAtTime(0, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 2.0);

        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.loop = true;
        source.connect(analyser);
        analyser.connect(master);
        master.connect(ctx.destination);
        source.start();

        return {
          analyser,
          audioMode: "real",
          source,
          master,
          synth: null,
          msg: "Karel's Path piano is playing — the field is painting itself.",
          hardError: "",
        };
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          throw err; // unmounted mid-load; let caller bail
        }
        // Fall soft to the seeded synth so the piece always runs.
        const synth = buildSynthEngine(ctx);
        const msg = err instanceof Error ? err.message : String(err);
        const missing =
          msg.includes("404") ||
          msg.includes("no url") ||
          msg.includes("audio API 4") ||
          msg.includes("audio file 4");
        return {
          analyser: synth.analyser,
          audioMode: "synth",
          source: null,
          master: null,
          synth,
          msg: missing
            ? "Recording unavailable — a seeded felt-piano is playing instead. Paste another UUID to try a different take."
            : "Playing a seeded felt-piano stand-in (same analysis drives the light).",
          // Only a genuine load error (not a plain 404) shows in destructive red.
          hardError: missing ? "" : `Audio load failed: ${msg.slice(0, 80)}`,
        };
      }
    },
    []
  );

  // ── Start (user gesture) ────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (status === "loading" || status === "running") return;
    setStatus("loading");
    setErrorMsg("");
    setStatusMsg("Loading Karel's recording…");

    const canvas = canvasRef.current;
    if (!canvas) {
      setStatus("error");
      setErrorMsg("Canvas unavailable.");
      return;
    }

    // AudioContext is created inside the gesture (autoplay policy).
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();

    let loaded;
    try {
      loaded = await loadAudio(ctx, uuid.trim() || DEFAULT_UUID);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        ctx.close().catch(() => {});
        return; // unmounted during load
      }
      setStatus("error");
      setErrorMsg("Unexpected audio error.");
      ctx.close().catch(() => {});
      return;
    }

    const renderer = createRenderer(canvas);
    setRendererKind(renderer.kind);
    const reader = buildSpectralReader(loaded.analyser);
    const rand = mulberry32(SEED);
    const depositState = makeDepositState(rand);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, dpr);

    const now = performance.now();
    engineRef.current = {
      ctx,
      reader,
      renderer,
      depositState,
      rand,
      source: loaded.source,
      master: loaded.master,
      synth: loaded.synth,
      raf: 0,
      startedAt: now,
      lastFrame: now,
    };

    setMode(loaded.audioMode);
    setStatusMsg(loaded.msg);
    setErrorMsg(loaded.hardError);
    setStatus("running");

    engineRef.current.raf = requestAnimationFrame(runLoop);
  }, [status, uuid, loadAudio, runLoop]);

  // ── Resize handling while running ───────────────────────────────────────────
  useEffect(() => {
    if (status !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      const canvas = canvasRef.current;
      if (!eng || !canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      eng.renderer.resize(rect.width, rect.height, dpr);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [status]);

  // ── Pointer "wind" (secondary) ──────────────────────────────────────────────
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (status !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height; // flip to y-up
    const prev = pointerRef.current;
    pointerRef.current = { x, y };
    if (!prev) return;
    const dx = x - prev.x;
    const dy = y - prev.y;
    const mag = Math.hypot(dx, dy);
    if (mag < 0.002) return;
    // A pure velocity push — no light of its own.
    windRef.current.push({
      x,
      y,
      hue: 0.6,
      size: 40,
      brightness: 0,
      vx: dx * 6,
      vy: dy * 6,
    });
  }, [status]);

  const running = status === "running";

  return (
    <div className="relative w-full min-h-[calc(100vh-3rem)] bg-background overflow-hidden">
      {/* Full-bleed art canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        className="absolute inset-0 h-full w-full"
        style={{ display: running ? "block" : "none", touchAction: "none" }}
      />

      {/* ── Header / chrome ─────────────────────────────────────────────── */}
      <div
        className={`relative z-10 mx-auto flex max-w-2xl flex-col gap-5 px-6 ${
          running ? "pt-6" : "min-h-[calc(100vh-3rem)] justify-center py-16"
        }`}
      >
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            4264 · Lucent
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            A living lightscape painted by Karel&apos;s piano
          </h1>
          <p className="text-base leading-relaxed text-foreground">
            Press Start: Karel&apos;s real Path piano loads and begins painting a
            slowly evolving cloud of light. A GPU flow-field advects and
            accumulates every note, so the lightscape at minute five is
            materially unlike minute one — a living pigment, not a loop.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={() => void start()}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "loading" ? "Loading…" : "Start"}
            </button>
          ) : (
            <button
              onClick={teardown}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          {/* LIVE / SYNTH badge (only meaningful once running) */}
          {running && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                mode === "real"
                  ? "border-primary/50 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  mode === "real" ? "bg-primary" : "bg-muted-foreground"
                }`}
              />
              {mode === "real" ? "LIVE" : "SYNTH"}
            </span>
          )}

          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {/* Audio UUID paste input */}
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Audio UUID
          </span>
          <input
            type="text"
            value={uuid}
            onChange={(e) => setUuid(e.target.value)}
            spellCheck={false}
            placeholder={DEFAULT_UUID}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>

        {/* Status + errors */}
        {statusMsg && !errorMsg && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {statusMsg}
            {rendererKind === "canvas2d" && (
              <span className="block text-muted-foreground">
                WebGL2 unavailable — running the Canvas2D fallback field.
              </span>
            )}
          </p>
        )}
        {errorMsg && (
          <p className="text-sm leading-relaxed text-destructive">{errorMsg}</p>
        )}

        {/* Design notes */}
        {showNotes && (
          <div className="rounded-md border border-border bg-background/70 p-5 text-sm leading-relaxed text-muted-foreground backdrop-blur-sm">
            <p className="mb-3 text-foreground">How the light is made</p>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>
                A WebGL2 <em>ping-pong feedback flow-field</em> (Jos Stam,
                &ldquo;Stable Fluids&rdquo;, 1999): a velocity field advects
                itself semi-Lagrangian and is stirred by a curl-noise force; a
                light/dye field is advected by it and fades very slowly, so the
                image accumulates a long-form memory.
              </li>
              <li>
                <span className="text-foreground">Spectral centroid</span>{" "}
                (Grey &amp; Gordon&apos;s correlate of timbral brightness) → the
                hue on the violet ramp and the vertical position of new light.
              </li>
              <li>
                <span className="text-foreground">RMS loudness</span> → the
                brightness and size of each deposit.
              </li>
              <li>
                <span className="text-foreground">Spectral flux</span> (onset
                energy) → the number of new plumes: a loud attack blooms a burst.
              </li>
              <li>
                Move the pointer over the field for a gentle secondary
                &ldquo;wind&rdquo; — the music always leads.
              </li>
            </ul>
            <p className="mt-3">
              After Refik Anadol&apos;s machine-hallucination pigment fields.
              Photosensitive-safe: slow, smooth, no strobing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Module-level helper (never named use*): analyser tuned for this piece.
function buildAnalyserFor(ctx: AudioContext): AnalyserNode {
  const a = ctx.createAnalyser();
  a.fftSize = 2048;
  a.smoothingTimeConstant = 0.6;
  return a;
}
