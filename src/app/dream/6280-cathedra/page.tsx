"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 6280-cathedra — an ALTERNATE JOURNEY ENGINE for Resonance.
//
//   A wordless, through-composed ~4-minute immersive arc. A single dramaturgical
//   TENSION CURVE (Freytag's pyramid) drives BOTH the generative music AND a
//   camera journey through morphing sacred architecture: descend into a dark
//   Narthex, pressure builds down the Nave, break through into blinding light,
//   then ascend home. The same curve is the music and the passage. It loops.
//
//   Self-playing on load. Optionally drop an audio file: its live spectral
//   tension replaces the synthetic curve and drives the whole world.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { JourneyEngine, type PhaseName } from "./engine";
import { ScoreAudio } from "./audio";
import { PassageScene } from "./scene";

const SEED = 0x6280;

export default function CathedraPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const engineRef = useRef<JourneyEngine | null>(null);
  const sceneRef = useRef<PassageScene | null>(null);
  const audioRef = useRef<ScoreAudio | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const phaseRef = useRef<PhaseName>("Narthex");
  const chromeTimerRef = useRef<number>(0);

  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [phase, setPhase] = useState<PhaseName>("Narthex");
  const [live, setLive] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);

  // ── load a dropped / picked audio file ───────────────────────────────────────
  const loadFile = useCallback(async (file: File) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.resume();
      const buf = await file.arrayBuffer();
      await audio.loadFile(buf);
      setLive(true);
    } catch {
      /* unreadable / undecodable file — stay on the synthetic engine */
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  // ── the mount: build engine + scene + audio, run the loop ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // scene (WebGL) — degrade gracefully if unavailable
    let scene: PassageScene;
    try {
      scene = new PassageScene(canvas, SEED, reduced);
    } catch {
      setWebglOk(false);
      return;
    }
    sceneRef.current = scene;

    const engine = new JourneyEngine(SEED);
    engineRef.current = engine;

    // audio — never required; visuals run regardless
    try {
      const audio = new ScoreAudio(SEED);
      audioRef.current = audio;
      audio.resume();
      if (audio.contextState() === "suspended") setNeedsTap(true);
    } catch {
      audioRef.current = null;
    }

    const resumeAudio = () => {
      const audio = audioRef.current;
      if (audio) {
        audio.resume();
        if (audio.contextState() === "running") setNeedsTap(false);
      }
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      sceneRef.current?.resize(w, h);
    };
    window.addEventListener("resize", onResize);
    onResize();

    const frameLoop = (ts: number) => {
      rafRef.current = requestAnimationFrame(frameLoop);
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const audio = audioRef.current;
      // dropped-file tension replaces the synthetic curve
      if (audio && audio.hasFile()) {
        engine.setLiveTension(audio.getLiveTension());
      }
      const f = engine.update(dt);
      sceneRef.current?.update(f, dt);
      if (audio) {
        audio.setFrame(f);
        audio.tick();
      }

      if (f.phase !== phaseRef.current) {
        phaseRef.current = f.phase;
        setPhase(f.phase);
      }
    };
    rafRef.current = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      window.removeEventListener("resize", onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // ── auto-fade the chrome on stillness (wordless immersive piece) ──────────────
  useEffect(() => {
    const wake = () => {
      setChromeVisible(true);
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = window.setTimeout(() => setChromeVisible(false), 4200);
    };
    window.addEventListener("pointermove", wake);
    wake();
    return () => {
      window.removeEventListener("pointermove", wake);
      window.clearTimeout(chromeTimerRef.current);
    };
  }, []);

  if (!webglOk) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-lg border border-border bg-background/60 p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Cathedra
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            This passage needs WebGL, which isn&apos;t available in your browser
            right now. The journey is a corridor of light rendered in real 3D — try
            a hardware-accelerated browser to walk it.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      ref={containerRef}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative h-dvh w-screen overflow-hidden bg-background"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* minimal, fade-able chrome */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${
          chromeVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="absolute left-5 top-5 max-w-xs">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Cathedra
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            An alternate journey engine — one tension curve, sung and walked.
          </p>
        </div>

        {/* subtle phase readout */}
        <div className="absolute bottom-5 left-5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {phase}
            {live ? " · live" : ""}
          </span>
        </div>

        {/* corner affordances (re-enable pointer events) */}
        <div className="pointer-events-auto absolute bottom-5 right-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Drop an audio file
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {needsTap && (
          <div className="absolute left-1/2 top-6 -translate-x-1/2">
            <span className="rounded-md border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
              tap anywhere to wake the sound
            </span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={onPick}
        className="hidden"
      />

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-6"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Cathedra — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single normalized <em>tension curve</em> T(t), shaped as Gustav
                Freytag&apos;s dramatic arc, runs over ~4 minutes and drives both
                the generative score and a camera journey through sacred
                architecture. The dramatic arc <em>is</em> a physical passage
                toward light.
              </p>
              <p>
                <strong className="text-foreground">Narthex</strong> — a dim,
                enclosed threshold; open consonant harmony, slow.{" "}
                <strong className="text-foreground">Nave</strong> — rising action:
                the colonnade lengthens, columns rise, the camera accelerates
                toward a growing light.{" "}
                <strong className="text-foreground">Breakthrough</strong> — climax:
                the space opens into a blinding aperture, harmony at its brightest
                and highest.{" "}
                <strong className="text-foreground">Ascent</strong> — falling
                action and resolution: the light softens to a warm afterglow, the
                harmony settles, and the journey loops gently home.
              </p>
              <p>
                Drop an audio file and its live spectral tension (energy,
                brightness, flux) replaces the synthetic curve — the same
                architecture then breathes to your music. All motion is slow drift;
                there is no strobe or flash.
              </p>
              <p className="text-xs">
                Lineage: Freytag&apos;s Pyramid; Morwaread Farbood&apos;s
                quantitative tension model; tonal-tension conditioning
                (Ebrahimzadeh, Bernardes &amp; Stober, arXiv 2511.19342, 2025);
                the light-spaces of James Turrell and Gothic cathedral
                phenomenology; and the transcendent minimalism of Arvo Pärt and
                Max Richter.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
