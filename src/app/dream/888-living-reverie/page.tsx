"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  buildMasterChain,
  fetchPianoBuffer,
  readChroma,
  readRms,
  startSeedPlayback,
  type MasterChain,
  type SeedPlayback,
} from "./audio";
import {
  AGE_DURATION_SEC,
  MemoryEngine,
  type ModeName,
  type Section,
} from "./engine";
import { createScene, type SceneHandle } from "./scene";

/*
 * 888 · LIVING REVERIE
 *
 * Karel's recorded piano as a 10-minute LIVING reverie — genuinely different at
 * minute 8 than minute 1. A two-tier generative memory engine (local pitch-cell
 * bank + global irreversible age/sections + a modal journey) re-voices his
 * motifs across an arc (sparse -> blooming -> dense -> dissolving) and never
 * loops. The visual is a single morphing displaced membrane whose form IS the
 * arc. See RESEARCH §531 (2026-06-24) in the README.
 */

type Phase = "idle" | "running" | "nowebgl";
type Status =
  | { kind: "fallback" }
  | { kind: "live" };

const SECTION_INDEX: Record<Section, number> = {
  sparse: 0,
  blooming: 1,
  dense: 2,
  dissolving: 3,
};

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function modeLabel(m: ModeName): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export default function LivingReveriePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Status>({ kind: "fallback" });
  const [showNotes, setShowNotes] = useState(false);

  // live HUD readouts
  const [elapsed, setElapsed] = useState(0);
  const [section, setSection] = useState<Section>("sparse");
  const [mode, setMode] = useState<ModeName>("ionian");
  const [agePct, setAgePct] = useState(0);

  // refs holding live audio/graphics objects for cleanup
  const chainRef = useRef<MasterChain | null>(null);
  const engineRef = useRef<MemoryEngine | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const seedRef = useRef<SeedPlayback | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const stopAll = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (seedRef.current) {
      try {
        seedRef.current.source.stop();
      } catch {
        /* already stopped */
      }
      seedRef.current = null;
    }
    if (sceneRef.current) {
      sceneRef.current.dispose();
      sceneRef.current = null;
    }
    if (chainRef.current) {
      const ctx = chainRef.current.ctx;
      try {
        chainRef.current.master.gain.cancelScheduledValues(ctx.currentTime);
        chainRef.current.master.gain.setValueAtTime(0, ctx.currentTime);
      } catch {
        /* noop */
      }
      void ctx.close();
      chainRef.current = null;
    }
    engineRef.current = null;
  }, []);

  // cleanup on unmount
  useEffect(() => stopAll, [stopAll]);

  const start = useCallback(async () => {
    if (runningRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- build the scene first; if WebGL unavailable, show notice ---
    const scene = createScene(canvas);
    if (!scene) {
      setPhase("nowebgl");
      return;
    }
    sceneRef.current = scene;

    // --- audio ---
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    const chain = await buildMasterChain(ctx);
    chainRef.current = chain;

    const engine = new MemoryEngine(chain);
    engineRef.current = engine;

    // fade master up smoothly to avoid a click
    chain.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    chain.master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.2);

    runningRef.current = true;
    setPhase("running");
    setStatus({ kind: "fallback" }); // starts generative; upgrades if live loads

    // --- analyser scratch buffers (real ArrayBuffer to satisfy TS) ---
    const N = chain.analyser.fftSize;
    const rmsScratch = new Float32Array(new ArrayBuffer(N * 4));

    // --- kick off the render+engine loop immediately (no network wait) ---
    let last = performance.now();
    const loop = () => {
      if (!runningRef.current) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const level = readRms(chain.analyser, rmsScratch);
      engine.audioLevel = level;
      engine.update(dt);

      const sec = engine.section;
      scene.render(engine.age, SECTION_INDEX[sec], Math.min(1, level * 3), dt);

      // throttle HUD state updates (~6/s)
      hudAccum += dt;
      if (hudAccum > 0.16) {
        hudAccum = 0;
        setElapsed(engine.age * AGE_DURATION_SEC);
        setSection(sec);
        setMode(engine.mode);
        setAgePct(engine.age * 100);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    let hudAccum = 0;
    rafRef.current = requestAnimationFrame(loop);

    // --- try Karel's real piano in the background as a soft seed ---
    void (async () => {
      const buffer = await fetchPianoBuffer(ctx);
      if (!buffer || !runningRef.current || !chainRef.current) return;
      const seed = startSeedPlayback(chain, buffer);
      seedRef.current = seed;

      // measure ~350ms of energy; if non-zero, mark live + start chroma seeding
      const freqN = seed.seedAnalyser.frequencyBinCount;
      const freqScratch = new Float32Array(new ArrayBuffer(freqN * 4));
      const energyScratch = new Float32Array(
        new ArrayBuffer(seed.seedAnalyser.fftSize * 4),
      );
      window.setTimeout(() => {
        if (!runningRef.current) return;
        const e = readRms(seed.seedAnalyser, energyScratch);
        if (e > 0.0005) {
          setStatus({ kind: "live" });
          // periodically refresh the local memory bank from his live chroma
          const chromaTimer = window.setInterval(() => {
            if (!runningRef.current || !engineRef.current) {
              clearInterval(chromaTimer);
              return;
            }
            const chroma = readChroma(
              seed.seedAnalyser,
              freqScratch,
              ctx.sampleRate,
            );
            engineRef.current.seedFromChroma(chroma);
          }, 4000);
        }
      }, 350);
    })();
  }, []);

  // handle resize while running
  useEffect(() => {
    const onResize = () => {
      const c = canvasRef.current;
      if (c && sceneRef.current) {
        sceneRef.current.resize(c.clientWidth, c.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05060d] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/55 px-6 text-center backdrop-blur-sm">
          <h1 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
            Living Reverie
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/80">
            Karel&rsquo;s recorded piano, re-dreamed as a ten-minute generative
            arc with memory &mdash; sparse, then blooming, dense, and finally
            dissolving. It never loops, and minute eight is a different world
            from minute one.
          </p>
          <button
            onClick={start}
            className="rounded-full bg-violet-500/90 px-6 py-3 text-base font-medium text-white shadow-lg transition hover:bg-violet-400"
          >
            Begin the reverie
          </button>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="text-base text-white/75 underline-offset-4 hover:underline"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* WebGL unavailable notice */}
      {phase === "nowebgl" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center">
          <h1 className="font-serif text-3xl text-white">Living Reverie</h1>
          <p className="max-w-md text-base text-amber-300/95">
            WebGL is unavailable in this browser, so the visual membrane
            can&rsquo;t render. Try a desktop browser with hardware acceleration
            enabled.
          </p>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-5 top-5 z-10 flex flex-col gap-1 font-mono text-base text-white/80">
            <span className="text-white/95">
              {fmtTime(elapsed)} / 10:00
            </span>
            <span>
              section &middot;{" "}
              <span className="text-violet-300">{section}</span>
            </span>
            <span>
              mode &middot;{" "}
              <span className="text-rose-300">{modeLabel(mode)}</span>
            </span>
            <span>age &middot; {agePct.toFixed(1)}%</span>
            {status.kind === "live" ? (
              <span className="text-emerald-300/95">
                playing Karel&rsquo;s piano
              </span>
            ) : (
              <span className="text-amber-300/95">
                generative piano &mdash; live recording unavailable
              </span>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-base text-white/75">
            drag to orbit the membrane
          </div>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="absolute bottom-5 right-5 z-10 text-base text-white/75 underline-offset-4 hover:underline"
          >
            Read the design notes
          </button>
        </>
      )}

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6">
          <div className="max-h-[80vh] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0d1a] p-7 text-base leading-relaxed text-white/85 shadow-2xl">
            <h2 className="mb-3 font-serif text-2xl text-white">
              Design notes
            </h2>
            <p className="mb-3">
              A two-tier generative memory engine. The{" "}
              <span className="text-violet-300">local tier</span> keeps a small
              bank of recent pitch cells (motifs of scale degrees + rhythm) and
              builds each new phrase by transposing and lightly varying cells
              already in the bank &mdash; so each minute sounds like the last.
              In live mode the bank is refreshed by chroma-folding Karel&rsquo;s
              recording; in fallback mode it is seeded from a built-in motif.
            </p>
            <p className="mb-3">
              The <span className="text-rose-300">global tier</span> is a single
              irreversible <em>age</em> walking 0&rarr;1 across ten minutes,
              driving a four-section state machine (sparse &rarr; blooming &rarr;
              dense &rarr; dissolving) plus a modal journey (Ionian &rarr;
              Lydian &rarr; Mixolydian &rarr; Dorian &rarr; Aeolian) with a
              creeping tonic. Age controls density, note rate, register spread,
              reverb depth and brightness. It never loops back.
            </p>
            <p className="mb-3">
              The visual is one displaced membrane whose form{" "}
              <em>is</em> the arc: nearly flat and dark when sparse, rising
              warm ridges as it blooms, a folded turbulent terrain at its
              densest, then collapsing back toward stillness and deep violet as
              it dissolves.
            </p>
            <p className="text-white/70">
              References: RESEARCH &sect;531 (2026-06-24) &mdash; &ldquo;Fusing
              Memory and Attention&rdquo;, arXiv 2603.21282 (March 2026); Brian
              Eno&rsquo;s generative music (<em>Music for Airports</em>,{" "}
              <em>Reflection</em>); Karel&rsquo;s &ldquo;Welcome Home&rdquo;
              Paths recording as the seed. Full write-up in{" "}
              <Link
                href="/dream/888-living-reverie/README.md"
                className="text-violet-300 underline"
              >
                README.md
              </Link>
              .
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 rounded-full bg-white/10 px-5 py-2.5 text-base text-white/90 hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
