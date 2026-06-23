"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type Occurrence,
  FALLBACK_OCCURRENCES,
  fetchOccurrences,
} from "./gbif";
import {
  type ScoreState,
  type SectionId,
  SECTIONS,
  createScoreState,
  sectionFor,
  harmonyAt,
  degreeInBand,
  degreeToMidi,
  lonToPan,
  recordEvent,
  clusteringDensity,
  richness,
} from "./structure";
import {
  type AudioEngine,
  createAudioEngine,
  destroyAudioEngine,
  applyArc,
  triggerVoice,
  readSpectrum,
} from "./audio";
import {
  type Bloom,
  drawScene,
  pruneBlooms,
  legendHit,
} from "./render";

/*
 * 877 · BIOSPHERE SCORE
 *
 * The living biosphere as an orchestra: every bird, mammal, insect, fungus
 * just observed on Earth (GBIF) is one EVENT that brings its taxonomic
 * section's voice in. The DATA decides who plays when — not the pitch. Each
 * section owns a register band (acoustic niche hypothesis); pitch is always
 * quantized to a shared modal scale that slowly modulates, so the music is
 * harmonic by construction. Clustering of events drives rhythmic density;
 * cumulative taxonomic richness drives a long-form arc. Hands-free auto-demo.
 */

type Phase = "idle" | "running" | "noaudio";
type Source = "live" | "offline";

// Compressed scheduling clock: one observation every ~0.62s, jittered.
const STEP_MS = 620;

export default function BiosphereScorePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const schedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const occRef = useRef<Occurrence[]>([]);
  const occIdxRef = useRef<number>(0);
  const stateRef = useRef<ScoreState>(createScoreState());
  const bloomsRef = useRef<Bloom[]>([]);
  const focusRef = useRef<SectionId | null>(null);
  const startedAtRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>("offline");
  const [showNotes, setShowNotes] = useState(false);

  // ---- one scheduled observation ----------------------------------------
  const scheduleNext = useCallback(() => {
    const engine = engineRef.current;
    const occs = occRef.current;
    if (!engine || occs.length === 0) return;

    const occ = occs[occIdxRef.current % occs.length];
    occIdxRef.current += 1;

    const now = engine.ctx.currentTime;
    const state = stateRef.current;
    const sectionId = sectionFor(occ);
    recordEvent(state, sectionId, now);

    // Long-form harmonic arc: modulate every ~36s, but only as richness grows.
    const elapsed = now - startedAtRef.current;
    const wantMod = Math.floor(elapsed / 36);
    if (wantMod > state.modulationIndex) {
      state.modulationIndex = wantMod;
      state.lastModulationT = now;
    }
    const harmony = harmonyAt(state.modulationIndex);

    // Pitch: a scale degree inside the section's band, quantized to harmony.
    const section = SECTIONS[sectionId];
    const degree = degreeInBand(section, occ.lat);
    const midi = degreeToMidi(harmony, degree);
    const panValue = lonToPan(occ.lon);

    const density = clusteringDensity(state, now);
    const rich = richness(state);
    const focused = focusRef.current === sectionId;
    // Busier passages get accented; soloed section is brighter.
    const intensity = 0.4 + density * 0.6;
    triggerVoice(engine, section, midi, panValue, intensity, focused);

    applyArc(engine, rich, density);

    bloomsRef.current.push({
      lon: occ.lon,
      lat: occ.lat,
      section: sectionId,
      label: occ.vernacularName ?? occ.scientificName,
      born: performance.now(),
    });

    // Clustering → rhythmic density: denser passages schedule closer together.
    const jitter = 0.55 + Math.random() * 0.9;
    const densityFactor = 1 - density * 0.45; // busier → shorter gaps
    const delay = STEP_MS * jitter * densityFactor;
    schedRef.current = setTimeout(scheduleNext, delay);
  }, []);

  // ---- render loop -------------------------------------------------------
  const runFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = performance.now();
    bloomsRef.current = pruneBlooms(bloomsRef.current, now);

    const spectrum = engine
      ? readSpectrum(engine)
      : new Uint8Array(512);
    const state = stateRef.current;
    const audioNow = engine ? engine.ctx.currentTime : now / 1000;
    const density = clusteringDensity(state, audioNow);
    const rich = richness(state);
    const harmony = harmonyAt(state.modulationIndex);

    drawScene(
      ctx,
      canvas.width,
      canvas.height,
      bloomsRef.current,
      state,
      spectrum,
      focusRef.current,
      rich,
      density,
      now,
      harmony.modeName
    );

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ---- load data then start scheduling -----------------------------------
  const beginScore = useCallback(async () => {
    // Try live GBIF; fall back to the curated offline set seamlessly.
    const abort = new AbortController();
    abortRef.current = abort;
    let occs: Occurrence[] | null = null;
    try {
      occs = await fetchOccurrences(abort.signal);
    } catch {
      occs = null;
    }
    if (occs && occs.length > 0) {
      setSource("live");
    } else {
      occs = FALLBACK_OCCURRENCES;
      setSource("offline");
    }
    // Shuffle a little so the same offline order isn't always identical.
    occRef.current = occs.slice().sort(() => Math.random() - 0.5);
    occIdxRef.current = 0;

    // Kick off the compressed clock immediately (auto-demo within ~1s).
    if (engineRef.current) {
      startedAtRef.current = engineRef.current.ctx.currentTime;
      scheduleNext();
    }
  }, [scheduleNext]);

  const handleStart = useCallback(() => {
    if (phase === "running") return;
    const engine = createAudioEngine();
    if (!engine) {
      setPhase("noaudio");
      // Still animate so the page is never static.
      rafRef.current = requestAnimationFrame(runFrame);
      void beginScore();
      return;
    }
    engineRef.current = engine;
    // iOS-safe: resume inside the user tap.
    void engine.ctx.resume().catch(() => {});
    setPhase("running");
    rafRef.current = requestAnimationFrame(runFrame);
    void beginScore();
  }, [phase, runFrame, beginScore]);

  // ---- pointer: solo a section -------------------------------------------
  const pickSection = useCallback((clientX: number, clientY: number): SectionId | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * canvas.width;
    const py = ((clientY - rect.top) / rect.height) * canvas.height;
    return legendHit(canvas.width, canvas.height, stateRef.current, px, py);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const hit = pickSection(e.clientX, e.clientY);
      // Hover focuses; click pins (handled in onClick).
      if (hit) focusRef.current = hit;
      else if (focusRef.current && !pinnedRef.current) focusRef.current = null;
    },
    [pickSection]
  );

  const pinnedRef = useRef<boolean>(false);
  const handleClick = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const hit = pickSection(e.clientX, e.clientY);
      if (hit) {
        if (focusRef.current === hit && pinnedRef.current) {
          focusRef.current = null;
          pinnedRef.current = false;
        } else {
          focusRef.current = hit;
          pinnedRef.current = true;
        }
      } else {
        focusRef.current = null;
        pinnedRef.current = false;
      }
    },
    [pickSection]
  );

  // ---- canvas sizing -----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(parent.clientWidth * dpr);
      canvas.height = Math.floor(parent.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ---- full teardown on unmount ------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (schedRef.current) clearTimeout(schedRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (engineRef.current) destroyAudioEngine(engineRef.current);
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#03040a] text-white">
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerDown={handleClick}
        />
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 w-full p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Biosphere Score
        </h1>
        <p className="mt-1 max-w-xl text-base text-white/75">
          Every species just observed on Earth becomes an orchestra — the live
          GBIF data decides which taxonomic section plays when.
        </p>
        {phase === "running" && (
          <p className="mt-2 text-base">
            {source === "live" ? (
              <span className="text-emerald-300/95">live GBIF feed</span>
            ) : (
              <span className="text-amber-300/95">
                offline — curated sample (auto-demo)
              </span>
            )}
          </p>
        )}
        {phase === "noaudio" && (
          <p className="mt-2 text-base text-rose-300">
            Web Audio unavailable — visuals only.
          </p>
        )}
      </div>

      {/* Start */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-black/45 px-8 py-8 backdrop-blur-sm">
            <p className="max-w-md text-center text-base text-white/80">
              An orchestra conducted by the living planet. Birds sing high,
              mammals sing low, fungi drone beneath — all in one slowly
              modulating key. Press start; it plays itself.
            </p>
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-violet-500/90 px-8 py-2.5 text-base font-medium text-white shadow-lg transition hover:bg-violet-400"
            >
              Start the orchestra
            </button>
            <span className="text-base text-white/55">
              no microphone · no camera · plays hands-free
            </span>
          </div>
        </div>
      )}

      {/* Design notes link */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-5 right-5 z-20 min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-violet-300 backdrop-blur-sm transition hover:bg-white/15"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-5 z-30 w-[min(92vw,30rem)] rounded-2xl bg-[#070912]/95 p-5 text-base text-white/80 shadow-2xl ring-1 ring-white/10">
          <h2 className="text-xl font-semibold text-white">Design notes</h2>
          <p className="mt-2 text-white/75">
            This is a <span className="text-violet-300">structural</span>{" "}
            sonification: the data shapes the{" "}
            <span className="text-white/95">ensemble and the form</span>, not
            the pitch of individual notes. Each observation brings its
            taxonomic section&apos;s voice in; pitch is always quantized to a
            shared modal scale, so it stays harmonic.
          </p>
          <ul className="mt-3 space-y-1 text-white/75">
            <li>
              <span className="text-white/95">Section → register band</span>{" "}
              follows Krause&apos;s acoustic niche hypothesis.
            </li>
            <li>
              <span className="text-white/95">Clustering</span> of events →
              rhythmic density.
            </li>
            <li>
              <span className="text-white/95">Cumulative richness</span> →
              long-form arc (fuller, brighter over time).
            </li>
            <li>Longitude → stereo pan. Scale modulates every ~36s.</li>
          </ul>
          <p className="mt-3 text-white/55">
            Hover or tap a section in the legend to solo it.
          </p>
        </div>
      )}
    </main>
  );
}
