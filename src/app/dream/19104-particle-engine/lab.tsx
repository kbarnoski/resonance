"use client";

/* ── 19104 · Particle Engine ──────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if every mote of light were a REAL simulated body that
 *  listens to its OWN slice of Karel's piano — instead of a full-screen shader
 *  faking particles per pixel and hearing the music through a few uniforms?
 *
 *  Up to a million GPU particles (WebGL2 GPGPU: float position/velocity
 *  textures, ping-ponged; attribute-less instanced points at native DPR,
 *  additive on black). The FFT is folded into 128 log bands and uploaded as a
 *  texture every frame; each particle samples its own band — bass motes surge
 *  their orbits, mid motes ride the curl current, the finest treble dust
 *  shimmers and scatters. Onsets open swells. Motion and structure only; a
 *  luminance governor caps brightness drift (WCAG 2.3.1).
 *
 *  Four souls, each a force law the field flows between (never a cut):
 *  Vortex · Smoke of Light · Fibonacci Bloom · Murmuration.
 *
 *  Engine: src/lib/particles/ (reusable — the journey lead-actor layer).
 *  Probe:  window.__resonanceParticles (fps, count, bands, particle state).
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import {
  createParticleEngine,
  ParticleEngineUnsupported,
  SOULS,
  type ParticleEngine,
  type SoulId,
} from "@/lib/particles/particle-engine";
import {
  createSpectrumAnalyzer,
  type SpectrumAnalyzer,
} from "@/lib/particles/spectrum";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Ghost")?.id ?? REAL_TRACKS[0].id;

const DENSITIES = [
  { label: "262k", n: 262_144 },
  { label: "410k", n: 409_600 },
  { label: "640k", n: 640_000 },
  { label: "1M", n: 1_048_576 },
] as const;

const AUTO_CYCLE_SEC = 80;

type Phase = "idle" | "loading" | "playing" | "error";

interface Readout {
  fps: number;
  count: number;
  bass: number;
  mid: number;
  treble: number;
  swell: number;
}

declare global {
  interface Window {
    __resonanceParticles?: unknown;
  }
}

function fmtCount(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}k`;
}

/** The original lab UI (controls, density, readouts) — reachable via ?lab=1. */
export function LabView() {
  const { immersive, toggle } = useImmersive();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const specRef = useRef<SpectrumAnalyzer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const playingRef = useRef(false);
  const autoRef = useRef(true);
  const soulRef = useRef<SoulId>("vortex");
  const lastSwitchRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [trackId, setTrackId] = useState(DEFAULT_TRACK);
  const [title, setTitle] = useState("");
  const [soul, setSoul] = useState<SoulId>("vortex");
  const [auto, setAuto] = useState(true);
  const [density, setDensity] = useState<number>(409_600);
  const [unsupported, setUnsupported] = useState("");
  const [notice, setNotice] = useState("");
  const [readout, setReadout] = useState<Readout>({ fps: 0, count: 0, bass: 0, mid: 0, treble: 0, swell: 0 });

  // ── engine lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const q = new URLSearchParams(window.location.search);
    const n = Number(q.get("n")) || 409_600;
    const dprQ = Number(q.get("dpr")) || undefined;
    const soulQ = q.get("soul") as SoulId | null;
    const initialSoul: SoulId = SOULS.some((s) => s.id === soulQ) ? (soulQ as SoulId) : "vortex";
    if (q.get("auto") === "0") {
      autoRef.current = false;
      setAuto(false);
    }
    soulRef.current = initialSoul;
    setSoul(initialSoul);
    setDensity(n);

    let engine: ParticleEngine;
    try {
      engine = createParticleEngine(canvas, {
        probe: true, // dream lab: verification read-back is fine here (never in journeys)
        count: n,
        dpr: dprQ,
        soul: initialSoul,
        onContextLost: () => setNotice("The GPU context was lost — reload to restore the field."),
        audio: (dt) => {
          const spec = specRef.current;
          if (!spec || !playingRef.current) return null;
          return spec.update(dt);
        },
      });
    } catch (e) {
      setUnsupported(
        e instanceof ParticleEngineUnsupported
          ? `This browser can't run the GPU field (${e.message}). Try desktop Chrome, Edge or Safari 17+.`
          : `The particle engine failed to start: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    engineRef.current = engine;
    // ?shape=a,b,c,d — a specific figure of the form (v4 per-appearance seed)
    const shapeQ = q.get("shape")?.split(",").map(Number);
    if (shapeQ && shapeQ.length === 4 && shapeQ.every(Number.isFinite)) engine.setShape(shapeQ as [number, number, number, number], true);
    // ?inst=n — field mode: n copies of the form
    const instQ = Number(q.get("inst"));
    if (instQ > 1) engine.setInstances(instQ, 0.37);
    engine.start();

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    // probe for self-verification (headed Playwright samples this)
    window.__resonanceParticles = {
      stats: () => ({ ...engine.stats(), playing: playingRef.current }),
      setSoul: (id: SoulId, sec?: number) => {
        soulRef.current = id;
        setSoul(id);
        engine.setSoul(id, sec);
        lastSwitchRef.current = performance.now();
      },
      setCount: (c: number) => engine.setCount(c),
      setDensity: (d: number) => engine.setDensity(d),
      // image dissolve ↔ reform test hook: two calls (prime, then dissolve)
      dissolveTo: async (url: string) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = 384;
        cv.height = Math.round((384 * img.naturalHeight) / img.naturalWidth);
        cv.getContext("2d")?.drawImage(img, 0, 0, cv.width, cv.height);
        return engine.dissolveTo(cv, img.naturalWidth / img.naturalHeight);
      },
      setAuto: (on: boolean) => {
        autoRef.current = on;
        setAuto(on);
      },
    };

    // readout + auto-cycle at 4 Hz (React never touches the render loop)
    lastSwitchRef.current = performance.now();
    const iv = window.setInterval(() => {
      const s = engine.stats();
      setReadout({
        fps: s.fps,
        count: s.count,
        bass: s.bands.bass,
        mid: s.bands.mid,
        treble: s.bands.treble,
        swell: s.swell,
      });
      if (autoRef.current && playingRef.current && performance.now() - lastSwitchRef.current > AUTO_CYCLE_SEC * 1000) {
        const i = SOULS.findIndex((x) => x.id === soulRef.current);
        const next = SOULS[(i + 1) % SOULS.length].id;
        soulRef.current = next;
        setSoul(next);
        engine.setSoul(next, 9);
        lastSwitchRef.current = performance.now();
      }
    }, 250);

    return () => {
      window.clearInterval(iv);
      window.removeEventListener("resize", onResize);
      engine.dispose();
      engineRef.current = null;
      delete window.__resonanceParticles;
    };
  }, []);

  // ── audio ──────────────────────────────────────────────────────────────────
  const stopSource = useCallback(() => {
    const src = srcRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current = null;
    }
    playingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopSource();
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopSource]);

  const play = useCallback(
    async (id: string) => {
      setNotice("");
      setTrackId(id);
      setPhase("loading");
      stopSource();
      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx();
        ctxRef.current = ctx;
        const safe = createSafeMaster(ctx, { gain: 0.8 });
        // our own resolution on the tamed tap: 4096-pt FFT so the low log
        // bands are real, light smoothing (the engine does its own slew)
        safe.analyser.fftSize = 4096;
        safe.analyser.smoothingTimeConstant = 0.45;
        safeRef.current = safe;
        specRef.current = createSpectrumAnalyzer(safe.analyser, { bins: 128 });
      }
      await ctx.resume().catch(() => {});
      try {
        const loaded = await loadRealTrackBuffer(ctx, id);
        const src = ctx.createBufferSource();
        src.buffer = loaded.buffer;
        // slow fade-in so the piece never starts abruptly
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
        src.connect(g);
        g.connect(safeRef.current!.input);
        src.onended = () => {
          if (srcRef.current !== src) return;
          // continue through the catalog
          const i = REAL_TRACKS.findIndex((t) => t.id === id);
          void play(REAL_TRACKS[(i + 1) % REAL_TRACKS.length].id);
        };
        srcRef.current = src;
        src.start();
        playingRef.current = true;
        setTitle(loaded.title);
        setPhase("playing");
      } catch (e) {
        setPhase("error");
        setNotice(
          `Couldn't load the recording (${e instanceof Error ? e.message : "network"}). The field keeps breathing in silence — try another take.`,
        );
      }
    },
    [stopSource],
  );

  const handlePlay = useCallback(() => {
    if (phase === "playing") {
      stopSource();
      setPhase("idle");
    } else {
      void play(trackId);
    }
  }, [phase, play, stopSource, trackId]);

  const chooseSoul = useCallback((id: SoulId) => {
    soulRef.current = id;
    setSoul(id);
    engineRef.current?.setSoul(id, 6);
    lastSwitchRef.current = performance.now();
  }, []);

  const chooseDensity = useCallback((n: number) => {
    setDensity(n);
    engineRef.current?.setCount(n);
  }, []);

  const toggleAuto = useCallback(() => {
    autoRef.current = !autoRef.current;
    setAuto(autoRef.current);
    lastSwitchRef.current = performance.now();
  }, []);

  const soulMeta = SOULS.find((s) => s.id === soul) ?? SOULS[0];
  const bar = (v: number) => `${Math.round(Math.max(0, Math.min(1, 0.5 + v)) * 100)}%`;

  return (
    <main className="fixed inset-0 z-[60] overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="GPU particle field reacting to the music" />

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Particle Engine"
        description="Up to a million real GPU particles, each listening to its own frequency band of Karel's recording. Bass motes surge their orbits, mid motes ride a curl current, the finest treble dust shimmers and scatters; onsets open swells. The music moves structure, never brightness."
        howTo={[
          "Press play — Karel's take begins and the field starts to listen.",
          "Pick a soul (Vortex, Smoke of Light, Fibonacci Bloom, Murmuration) — the particles flow into the new form.",
          "Auto lets the souls drift on their own every ~80 s.",
          "Density sets the particle count (262k to 1M).",
          "Press f for fullscreen, i for info.",
        ]}
      />

      {/* live readout — always visible, quiet */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
        <span>
          {fmtCount(readout.count)} particles · {readout.fps.toFixed(0)} fps
        </span>
        <span>
          {soulMeta.title}
          {phase === "playing" && title ? ` · ${title}` : phase === "loading" ? " · loading…" : " · silence"}
        </span>
        {phase === "playing" && (
          <span className="flex items-center gap-2">
            {(["bass", "mid", "treble"] as const).map((b) => (
              <span key={b} className="flex items-center gap-1">
                {b[0]}
                <span className="relative inline-block h-1 w-10 overflow-hidden rounded-full bg-muted/40">
                  <span className="absolute inset-y-0 left-0 bg-primary/70" style={{ width: bar(readout[b]) }} />
                </span>
              </span>
            ))}
          </span>
        )}
      </div>

      {!immersive && (
        <>
          <div className="pointer-events-none absolute right-4 top-4 z-30">
            <Link
              href="/dream"
              className="pointer-events-auto text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← dream lab
            </Link>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
            <div className="max-w-xl">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Particle Engine</h1>
              <p className="mt-1.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                {soulMeta.title} — {soulMeta.line}. Every mote is a simulated body hearing its own
                band of the piano.
              </p>
            </div>

            {(notice || unsupported) && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                {unsupported || notice}
              </p>
            )}

            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePlay}
                disabled={phase === "loading" || !!unsupported}
                className={
                  phase === "playing"
                    ? "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    : "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                }
              >
                {phase === "playing" ? "Stop" : phase === "loading" ? "Loading…" : "Play"}
              </button>

              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                take
                <select
                  value={trackId}
                  onChange={(e) => {
                    setTrackId(e.target.value);
                    if (phase === "playing") void play(e.target.value);
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {COLLECTIONS.map((c) => (
                    <optgroup key={c.name} label={c.name}>
                      {c.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Soul">
                {SOULS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseSoul(s.id)}
                    aria-pressed={soul === s.id}
                    className={
                      soul === s.id
                        ? "min-h-[44px] rounded-md border border-primary/60 bg-primary/15 px-3 text-sm text-foreground"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    }
                  >
                    {s.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={toggleAuto}
                  aria-pressed={auto}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  auto {auto ? "on" : "off"}
                </button>
              </div>

              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                density
                <select
                  value={density}
                  onChange={(e) => chooseDensity(Number(e.target.value))}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {DENSITIES.map((d) => (
                    <option key={d.n} value={d.n}>
                      {d.label}
                    </option>
                  ))}
                  {!DENSITIES.some((d) => d.n === density) && <option value={density}>{fmtCount(density)}</option>}
                </select>
              </label>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
