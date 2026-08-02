"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 5160 · Data Pigment — Karel's piano rendered as living, breathing data-pigment.
//
// THE ONE QUESTION: What if Karel's real piano recording were rendered as
// living, breathing data-pigment — a boundless oceanic flow-field of coloured
// dye that the music itself paints, advects, and blooms — a drug-free
// cosmic-ambient / oceanic-boundlessness state?
//
// A WebGL2 ping-pong dye field (Jos Stam, "Stable Fluids", 1999) advects a
// colour field along a curl-noise + music-modulated velocity. The spectrum of
// Karel's real Path piano is split into five bands; each injects pigment of its
// own colour into the fluid, and onsets bloom radial rings. The field is ALREADY
// alive on load from a seeded ambient generator, so a silent phone viewer sees
// the whole idea with no interaction; pressing play swaps in the real audio.
//
// After Refik Anadol's "data as pigment" (Dataland, LA 2026). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildSpectralReader, type SpectralReader } from "./analysis";
import { buildSynthEngine, type SynthEngine } from "./synth";
import { createRenderer, type Renderer } from "./gl";
import { buildStrokes, buildAmbientStrokes, makeDepositState, type DepositState } from "./deposit";
import { mulberry32, SEED } from "./rng";

const DEFAULT_UUID = "549fc519-f7fc-4c38-a771-adaad2edbc81"; // Karel's Path piano

type AudioStatus = "idle" | "loading" | "playing" | "error";
type AudioMode = "real" | "synth";

interface AudioBundle {
  ctx: AudioContext;
  reader: SpectralReader;
  source: AudioBufferSourceNode | null;
  master: GainNode | null;
  synth: SynthEngine | null;
}

interface Engine {
  renderer: Renderer;
  depositState: DepositState;
  rand: () => number;
  raf: number;
  startedAt: number;
  lastFrame: number;
  audio: AudioBundle | null;
  energy: number; // smoothed
  bass: number; // smoothed
}

export default function DataPigmentPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reducedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<AudioStatus>("idle");
  const [mode, setMode] = useState<AudioMode | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgl2" | "canvas2d" | null>(null);

  // ── Audio teardown (keeps the ambient field painting) ───────────────────────
  const teardownAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const eng = engineRef.current;
    if (!eng || !eng.audio) return;
    const a = eng.audio;
    eng.audio = null;
    try {
      a.source?.stop();
    } catch {
      /* already stopped */
    }
    try {
      a.source?.disconnect();
      a.master?.disconnect();
    } catch {
      /* ok */
    }
    a.synth?.stop();
    if (a.ctx.state !== "closed") {
      a.ctx.close().catch(() => {});
    }
  }, []);

  // ── The render loop (always running once mounted) ───────────────────────────
  const runLoop = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - eng.lastFrame) / 1000 || 0.016);
    eng.lastFrame = now;
    const time = (now - eng.startedAt) / 1000;
    const reduced = reducedRef.current;

    let strokes;
    let targetEnergy: number;
    let targetBass: number;
    if (eng.audio) {
      const frame = eng.audio.reader.read();
      strokes = buildStrokes(frame, eng.depositState, eng.rand, time, reduced);
      targetEnergy = frame.rms;
      targetBass = frame.bass;
    } else {
      strokes = buildAmbientStrokes(eng.depositState, eng.rand, time, reduced);
      // A gentle self-modulating swell so the pre-audio ocean still breathes.
      targetEnergy = 0.14 + 0.08 * Math.max(0, Math.sin(time * 0.06));
      targetBass = 0.1 + 0.06 * Math.max(0, Math.sin(time * 0.04 + 1.5));
    }
    // Smooth the flow modulation so it moves over seconds, not frames.
    eng.energy += (targetEnergy - eng.energy) * 0.05;
    eng.bass += (targetBass - eng.bass) * 0.04;

    eng.renderer.frame({
      strokes,
      dt,
      time,
      energy: eng.energy,
      bass: eng.bass,
      reduced,
    });
    eng.raf = requestAnimationFrame(runLoop);
  }, []);

  // ── Mount: build renderer, start painting immediately (autonomous) ──────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener("change", onMq);

    const renderer = createRenderer(canvas);
    setRendererKind(renderer.kind);
    const rand = mulberry32(SEED);
    const depositState = makeDepositState(rand);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width || window.innerWidth, rect.height || window.innerHeight, dpr);

    const now = performance.now();
    engineRef.current = {
      renderer,
      depositState,
      rand,
      raf: 0,
      startedAt: now,
      lastFrame: now,
      audio: null,
      energy: 0.12,
      bass: 0.1,
    };
    engineRef.current.raf = requestAnimationFrame(runLoop);

    const onResize = () => {
      const eng = engineRef.current;
      const c = canvasRef.current;
      if (!eng || !c) return;
      const d = Math.min(2, window.devicePixelRatio || 1);
      const r = c.getBoundingClientRect();
      eng.renderer.resize(r.width, r.height, d);
    };
    window.addEventListener("resize", onResize);

    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("resize", onResize);
      abortRef.current?.abort();
      abortRef.current = null;
      const eng = engineRef.current;
      engineRef.current = null;
      if (eng) {
        cancelAnimationFrame(eng.raf);
        if (eng.audio) {
          try {
            eng.audio.source?.stop();
          } catch {
            /* ok */
          }
          try {
            eng.audio.source?.disconnect();
            eng.audio.master?.disconnect();
          } catch {
            /* ok */
          }
          eng.audio.synth?.stop();
          if (eng.audio.ctx.state !== "closed") {
            eng.audio.ctx.close().catch(() => {});
          }
        }
        try {
          eng.renderer.dispose();
        } catch {
          /* ok */
        }
      }
    };
  }, [runLoop]);

  // ── Real-audio loader with seeded ambient-pad fallback ──────────────────────
  const loadAudio = useCallback(
    async (
      ctx: AudioContext,
      id: string
    ): Promise<{
      bundle: AudioBundle;
      audioMode: AudioMode;
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

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.72;

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
          bundle: {
            ctx,
            reader: buildSpectralReader(analyser),
            source,
            master,
            synth: null,
          },
          audioMode: "real",
          msg: "Karel's Path piano is painting the pigment field.",
          hardError: "",
        };
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err; // unmounted mid-load
        // Fall soft to the seeded cosmic-ambient pad so the piece always sounds.
        const synth = buildSynthEngine(ctx);
        const msg = err instanceof Error ? err.message : String(err);
        const missing =
          msg.includes("404") ||
          msg.includes("no url") ||
          msg.includes("audio API 4") ||
          msg.includes("audio file 4");
        return {
          bundle: {
            ctx,
            reader: buildSpectralReader(synth.analyser),
            source: null,
            master: null,
            synth,
          },
          audioMode: "synth",
          msg: missing
            ? "Recording unavailable — a seeded cosmic-ambient pad is painting instead."
            : "Playing a seeded cosmic-ambient pad (the same analysis paints the field).",
          hardError: missing ? "" : `Audio load failed: ${msg.slice(0, 80)}`,
        };
      }
    },
    []
  );

  // ── Play (user gesture — required for audio autoplay) ───────────────────────
  const play = useCallback(async () => {
    if (status === "loading" || status === "playing") return;
    if (!engineRef.current) return;
    setStatus("loading");
    setErrorMsg("");
    setStatusMsg("Loading Karel's recording…");

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();

    let loaded;
    try {
      loaded = await loadAudio(ctx, DEFAULT_UUID);
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

    const eng = engineRef.current;
    if (!eng) {
      // Unmounted while awaiting; discard the context we just built.
      loaded.bundle.synth?.stop();
      ctx.close().catch(() => {});
      return;
    }
    eng.audio = loaded.bundle;
    setMode(loaded.audioMode);
    setStatusMsg(loaded.msg);
    setErrorMsg(loaded.hardError);
    setStatus("playing");
  }, [status, loadAudio]);

  const stopAudio = useCallback(() => {
    teardownAudio();
    setStatus("idle");
    setMode(null);
    setStatusMsg("Audio stopped — the field keeps drifting on its seeded flow.");
    setErrorMsg("");
  }, [teardownAudio]);

  const playing = status === "playing";

  return (
    <div className="relative w-full min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
      {/* Full-bleed art canvas — always visible, painting from load. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── Header / chrome ─────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-5 px-6 pt-10">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            5160 · Data Pigment
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Data Pigment
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground">
            Karel&apos;s real piano rendered as living, breathing data-pigment — a
            boundless oceanic flow-field of coloured dye that the music itself
            paints, advects, and blooms.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!playing ? (
            <button
              onClick={() => void play()}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "loading" ? "Loading…" : "Play Karel's piano"}
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop audio
            </button>
          )}

          {playing && mode && (
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
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Status + errors */}
        {!errorMsg && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {statusMsg ||
              "The field is already alive — a seeded flow drifts and blooms. Press play to let Karel's piano take over the pigment."}
            {rendererKind === "canvas2d" && (
              <span className="mt-1 block text-destructive">
                WebGL2 unavailable — running the reduced Canvas2D pigment fallback.
              </span>
            )}
          </p>
        )}
        {errorMsg && <p className="text-sm leading-relaxed text-destructive">{errorMsg}</p>}
      </div>

      {/* ── Design-notes modal ──────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A WebGL2 <em>ping-pong dye field</em> (Jos Stam, &ldquo;Stable
                Fluids&rdquo;, 1999): a velocity field advects itself
                semi-Lagrangian and is stirred by a curl-noise force; a coloured
                dye field is carried along it and dissipates very slowly, so the
                image accumulates a long, breathing memory.
              </p>
              <p>
                Karel&apos;s spectrum is split into five bands (sub · low · mid ·
                high · air). Each band injects pigment of its own colour — a deep
                indigo-blue for the sub, a pale magenta for the air — at a slowly
                orbiting anchor, so the shape of a chord becomes the shape of the
                cloud. Overall loudness and bass modulate the swirl and the slow
                oceanic swell; onsets bloom radial rings.
              </p>
              <p>
                After Refik Anadol&apos;s treatment of{" "}
                <span className="text-foreground">data as pigment</span> — the
                signature of <em>Dataland</em>, the AI art museum that opened in
                Los Angeles in 2026 (NPR, 29 July 2026: &ldquo;machines are
                collaborators&rdquo;). Drug-free cosmic-ambient / oceanic
                boundlessness; slow, smooth, photosensitive-safe.
              </p>
              <p>
                If the recording can&apos;t be fetched, a seeded cosmic-ambient
                pad drives the identical analysis. Before you press play, and on a
                silent phone, a seeded ambient generator keeps the ocean painting
                itself.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
