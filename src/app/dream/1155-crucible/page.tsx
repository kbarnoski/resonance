"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioEngine,
  fetchRecordingBuffer,
  decodeFileBuffer,
  renderFallbackBuffer,
  PIANO_RECORDING_ID,
  type AudioFrame,
  type AudioSourceKind,
} from "./audio";
import { MolecularDynamics, type MDStats } from "./md";
import { CrucibleScene, hasWebGL } from "./scene";

const N_PARTICLES = 900;
const DT = 0.004; // reduced-unit timestep
const SUBSTEPS = 10; // MD substeps per animation frame

type Phase = "idle" | "loading" | "playing";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Map audio energy (0..1) + a cooling offset to a target reduced temperature. */
function targetTemperature(energy: number, cool: number): number {
  const t = 0.1 + Math.pow(energy, 1.3) * 2.5 - cool * 1.25;
  return t < 0.02 ? 0.02 : t;
}

const PHASE_COLOR: Record<MDStats["phase"], string> = {
  SOLID: "text-cyan-300",
  LIQUID: "text-teal-200",
  GAS: "text-fuchsia-300",
};

export default function CruciblePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recordingId, setRecordingId] = useState(PIANO_RECORDING_ID);
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [cool, setCool] = useState(0);
  const [readout, setReadout] = useState<MDStats | null>(null);
  const [minutes, setMinutes] = useState(0);

  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mdRef = useRef<MolecularDynamics | null>(null);
  const sceneRef = useRef<CrucibleScene | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);

  const startRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const onsetCdRef = useRef<number>(0);
  const statAccRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  const coolRef = useRef<number>(0);

  // Pointer-drag heat injection state.
  const draggingRef = useRef<boolean>(false);
  const dragPtRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    coolRef.current = cool;
  }, [cool]);

  // ── Build the sim + renderer + animation loop once, before any gesture ──
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const md = new MolecularDynamics(N_PARTICLES);
    mdRef.current = md;

    if (!hasWebGL()) {
      setWebglFailed(true);
      return;
    }

    let scene: CrucibleScene;
    try {
      scene = new CrucibleScene(host, N_PARTICLES, md.L);
    } catch {
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;

    const runResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", runResize);

    startRef.current = performance.now();
    lastRef.current = startRef.current;
    const substeps = reducedRef.current ? 6 : SUBSTEPS;

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const t = (now - startRef.current) / 1000;
      elapsedRef.current += dt;

      const sim = mdRef.current;
      const scn = sceneRef.current;
      if (!sim || !scn) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Drive: real audio analysis once playing, else a gentle idle warmth so
      // the crucible is a slowly-breathing crystal before Play is pressed.
      let af: AudioFrame;
      if (playingRef.current && engineRef.current) {
        af = engineRef.current.getFrame();
      } else {
        const e = 0.1 + 0.08 * Math.sin(t * 0.35) + 0.03 * Math.sin(t * 1.3);
        af = { energy: clamp01(e), flux: 0, centroid: 0.35 };
      }

      const targetT = targetTemperature(af.energy, coolRef.current);

      // Onset spike → a global kinetic shock through the medium.
      onsetCdRef.current -= dt;
      if (af.flux > 0.34 && onsetCdRef.current <= 0) {
        onsetCdRef.current = 0.12;
        sim.applyShock(af.flux * (reducedRef.current ? 0.8 : 1.5));
      }

      // Advance the real MD integrator by SUBSTEPS symplectic steps.
      for (let s = 0; s < substeps; s++) {
        sim.step(DT, targetT);
      }

      // User drag → local heat injection at the pointer.
      if (draggingRef.current && dragPtRef.current) {
        sim.applyLocalHeat(
          dragPtRef.current.x,
          dragPtRef.current.y,
          3.0,
          reducedRef.current ? 1.1 : 1.9,
        );
      }

      scn.sync(sim, {
        centroid: af.centroid,
        energy: af.energy,
        reduced: reducedRef.current,
      });
      scn.render(elapsedRef.current, reducedRef.current);

      // Throttled HUD update.
      statAccRef.current += dt;
      if (statAccRef.current > 0.25) {
        statAccRef.current = 0;
        setReadout(sim.stats(targetT));
        setMinutes(elapsedRef.current / 60);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", runResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      mdRef.current = null;
      const eng = engineRef.current;
      engineRef.current = null;
      playingRef.current = false;
      if (eng) void eng.dispose();
    };
  }, []);

  // ── Play: create the audio engine (gesture-gated) and pick a source ──
  const runPlay = useCallback(
    async (file?: File) => {
      if (phase === "loading") return;
      setPhase("loading");
      setNotice(null);

      if (engineRef.current) {
        playingRef.current = false;
        void engineRef.current.dispose();
        engineRef.current = null;
      }

      let engine: AudioEngine;
      try {
        engine = new AudioEngine();
      } catch {
        setNotice("Web Audio is unavailable in this browser.");
        setPhase("idle");
        return;
      }

      let buffer: AudioBuffer | null = null;
      let kind: AudioSourceKind = "fallback";

      if (file) {
        buffer = await decodeFileBuffer(engine.ctx, file);
        if (buffer) kind = "file";
        else
          setNotice(
            "That file could not be decoded — playing the synth demo instead.",
          );
      } else {
        const id = recordingId.trim();
        if (id) {
          buffer = await fetchRecordingBuffer(engine.ctx, id);
          if (buffer) kind = "recording";
          else
            setNotice(
              "Could not load that recording (network or access) — playing the synth demo instead.",
            );
        }
      }

      if (!buffer) {
        buffer = await renderFallbackBuffer(engine.ctx.sampleRate);
        kind = "fallback";
      }

      try {
        await engine.start(buffer, true);
      } catch {
        setNotice("Playback could not start.");
        void engine.dispose();
        setPhase("idle");
        return;
      }

      engineRef.current = engine;
      playingRef.current = true;
      setSource(kind);
      setPhase("playing");
    },
    [phase, recordingId],
  );

  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void runPlay(file);
    },
    [runPlay],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void runPlay(file);
    },
    [runPlay],
  );

  // ── Pointer drag → stir heat into the medium ──
  const updateDragPoint = useCallback((clientX: number, clientY: number) => {
    const scn = sceneRef.current;
    if (!scn) return;
    dragPtRef.current = scn.screenToSim(clientX, clientY);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      updateDragPoint(e.clientX, e.clientY);
    },
    [updateDragPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      updateDragPoint(e.clientX, e.clientY);
    },
    [updateDragPoint],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    dragPtRef.current = null;
  }, []);

  const sourceLabel =
    source === "recording"
      ? "Karel's recording"
      : source === "file"
        ? "your file"
        : source === "fallback"
          ? "synth demo"
          : null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04060a] text-white">
      {/* three.js point-cloud host — drag to inject heat */}
      <div
        ref={canvasHostRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        aria-hidden="true"
      />

      {/* Vignette for text legibility over the field */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <p className="mb-2 text-sm uppercase tracking-[0.28em] text-cyan-200/80">
            Resonance · Dream Lab
          </p>
          <h1 className="font-serif text-4xl font-medium leading-tight text-white sm:text-5xl">
            The Crucible
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-white/80">
            Karel&rsquo;s piano is the only heat source. Its moment-to-moment
            energy sets the temperature of a real Lennard-Jones gas — ~900
            particles under genuine molecular dynamics. Quiet passages freeze
            matter into a hexagonal crystal; loud ones melt and vaporise it.
            Drag on the field to stir in heat by hand.
          </p>
        </header>

        {/* Live phase readout */}
        {readout && (
          <div className="pointer-events-auto mx-auto mb-2 w-full max-w-md rounded-2xl border border-white/10 bg-black/45 px-5 py-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-sm uppercase tracking-widest text-white/60">
                Phase
              </span>
              <span
                className={`font-serif text-2xl font-semibold ${PHASE_COLOR[readout.phase]}`}
              >
                {readout.phase}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm text-white/75">
              <div>
                <div className="text-white/50">T (now)</div>
                <div className="tabular-nums text-white/90">
                  {readout.temperature.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-white/50">T (target)</div>
                <div className="tabular-nums text-white/90">
                  {readout.targetTemperature.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-white/50">⟨neighbours⟩</div>
                <div className="tabular-nums text-white/90">
                  {readout.avgCoordination.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <section className="pointer-events-auto max-w-xl">
          {phase !== "playing" ? (
            <div className="rounded-2xl border border-white/10 bg-black/45 p-5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => void runPlay()}
                disabled={phase === "loading" || webglFailed}
                className="min-h-[44px] w-full rounded-lg bg-cyan-300 px-4 py-2.5 text-base font-semibold text-[#04121a] transition-colors hover:bg-cyan-200 disabled:opacity-60 sm:w-auto"
              >
                {phase === "loading" ? "Heating…" : "Play — heat the crucible"}
              </button>

              <label
                htmlFor="rec-id"
                className="mt-4 block text-sm font-medium text-white/75"
              >
                Path recording id
              </label>
              <input
                id="rec-id"
                type="text"
                value={recordingId}
                onChange={(e) => setRecordingId(e.target.value)}
                spellCheck={false}
                className="mt-2 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2.5 font-mono text-sm text-white/90 outline-none placeholder:text-white/40 focus:border-cyan-300/60"
                placeholder="recording id"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`mt-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors ${
                  dragOver
                    ? "border-cyan-300/70 bg-cyan-300/10 text-white/90"
                    : "border-white/15 text-white/60"
                }`}
              >
                Drop an audio file here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-cyan-200 underline underline-offset-2 hover:text-cyan-100"
                >
                  choose a file
                </button>
                . No id or file? Play uses a gentle synth demo.
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={onFilePicked}
                  className="hidden"
                />
              </div>

              {notice && <p className="mt-3 text-sm text-rose-300">{notice}</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
              <p className="text-base text-white/85">
                Heating from{" "}
                <span className="text-cyan-200">{sourceLabel}</span>.
                <span className="ml-2 text-white/60">
                  {minutes < 1
                    ? "the lattice is finding itself…"
                    : `${minutes.toFixed(1)} min in the crucible`}
                </span>
              </p>
              {source === "fallback" && (
                <p className="mt-1 text-sm text-cyan-300">
                  Synth fallback — no recording or file loaded.
                </p>
              )}
              {notice && <p className="mt-2 text-sm text-rose-300">{notice}</p>}

              {/* Cool slider — offset the thermostat to force re-crystallization */}
              <label
                htmlFor="cool"
                className="mt-4 block text-sm font-medium text-white/75"
              >
                Cooling: {cool.toFixed(2)}{" "}
                <span className="text-white/50">
                  (drag right to freeze against the music)
                </span>
              </label>
              <input
                id="cool"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={cool}
                onChange={(e) => setCool(parseFloat(e.target.value))}
                className="mt-2 w-full accent-cyan-300"
              />
            </div>
          )}

          {webglFailed && (
            <p className="mt-3 text-sm text-rose-300">
              WebGL is unavailable in this browser, so the 3D crucible can&rsquo;t
              render. The physics still runs, but you won&rsquo;t see it — try a
              browser with WebGL enabled.
            </p>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="text-sm text-white/70 underline underline-offset-2 hover:text-white/90"
            >
              {showNotes ? "Hide design notes" : "Design notes"}
            </button>
            <Link
              href="/dream"
              className="text-sm text-white/60 hover:text-white/85"
            >
              ← all prototypes
            </Link>
          </div>

          {showNotes && (
            <div className="mt-3 max-w-xl rounded-2xl border border-white/10 bg-black/50 p-5 text-sm leading-relaxed text-white/75 backdrop-blur-md">
              <p>
                Real molecular dynamics: ~900 particles interact through the{" "}
                <span className="text-cyan-200">Lennard-Jones</span> pair
                potential (John Lennard-Jones, 1924), integrated with{" "}
                <span className="text-cyan-200">velocity-Verlet</span> (Loup
                Verlet, 1967) at a 2.5σ cutoff via an O(N) cell list. A Berendsen
                thermostat sets the temperature from the music&rsquo;s RMS
                energy — the only heat source. Onsets (spectral flux) fire a
                kinetic shock; brightness (spectral centroid) biases the hot
                colour.
              </p>
              <p className="mt-3">
                Cold packs the cluster into a hexagonal close-packed crystal
                (coordination → 6, crystal-cyan); heat melts it to a liquid drop
                and then boils it into a gas that fills the box (plasma-magenta).
                Reflecting walls keep the gas bounded; a soft-core force clamp
                keeps violent collisions stable. Colour drifts smoothly with
                local kinetic energy — no strobe.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
