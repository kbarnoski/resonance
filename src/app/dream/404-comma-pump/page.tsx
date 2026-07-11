"use client";

/**
 * 404-comma-pump — Syntonic Comma Pump
 *
 * Autonomous long-form generative piece in adaptive 5-limit just intonation.
 * The progression I → IV → ii → V → I uses pure ratio root motions whose
 * product is 80/81 — one syntonic comma flat — so currentRootHz drifts
 * downward by ~21.5 cents per cycle indefinitely.
 *
 * UI: Start/Stop · JI ⇄ 12-TET toggle · tempo slider
 * Output: Canvas2D pitch-river with scrolling voice trails + HUD
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HOME_HZ,
  PROGRESSION,
  octaveNorm,
  type ProgressionStep,
} from "./tuning";
import { SynthEngine } from "./audio";

// ── Engine state ──────────────────────────────────────────────────────────────

interface EngineState {
  synth: SynthEngine;
  stepIndex: number;
  currentRootHz: number;
  /** Accumulated drift in cents (not reset on octave normalization) */
  cumulativeCents: number;
  stepTimer: ReturnType<typeof setTimeout> | null;
}

// ── Canvas constants ──────────────────────────────────────────────────────────

/** Soft palette for chord voices (root, 3rd, 5th, 7th) */
const VOICE_COLORS = [
  "rgba(167, 139, 250, 0.85)",  // violet-400  — root
  "rgba(129, 236, 230, 0.75)",  // teal-300    — 3rd
  "rgba(253, 224, 71,  0.70)",  // yellow-300  — 5th
  "rgba(240, 171, 252, 0.70)",  // fuchsia-300 — 7th
] as const;

// ── Canvas drawing helpers ────────────────────────────────────────────────────

/**
 * Map a frequency (Hz) to a canvas Y coordinate (log scale).
 * Higher pitch → smaller Y (top of canvas).
 */
function computePitchY(hz: number, canvasH: number): number {
  const minLog = Math.log2(50);
  const maxLog = Math.log2(1200);
  const t = (Math.log2(hz) - minLog) / (maxLog - minLog);
  return canvasH * (1 - t);
}

/**
 * Advance the scrolling pitch-river by one column.
 * Shifts existing pixels left by 1, draws the new rightmost column.
 */
function drawPitchRiverColumn(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  voiceFreqs: number[],
  homeHz: number,
  currentRootHz: number,
): void {
  const W = canvas.width;
  const H = canvas.height;

  // Shift canvas left by 1px (horizontal scroll)
  const imageData = ctx.getImageData(1, 0, W - 1, H);
  ctx.putImageData(imageData, 0, 0);

  // Background fill for new right column
  ctx.fillStyle = "#080b12";
  ctx.fillRect(W - 1, 0, 1, H);

  // Faint fixed home-tonic line (dim blue)
  const homeY = computePitchY(homeHz, H);
  ctx.fillStyle = "rgba(100, 100, 180, 0.28)";
  ctx.fillRect(W - 1, Math.max(0, Math.round(homeY) - 1), 1, 2);

  // Brighter drifting root line (violet)
  const rootNorm = octaveNorm(currentRootHz, 80, 600);
  const rootY = computePitchY(rootNorm, H);
  ctx.fillStyle = "rgba(139, 92, 246, 0.70)";
  ctx.fillRect(W - 1, Math.max(0, Math.round(rootY) - 1), 1, 3);

  // Chord voices as colored pixel columns
  voiceFreqs.forEach((hz, i) => {
    if (hz <= 0) return;
    const y = computePitchY(hz, H);
    ctx.fillStyle = VOICE_COLORS[i % VOICE_COLORS.length];
    ctx.fillRect(W - 1, Math.max(0, Math.round(y) - 2), 1, 5);
  });
}

/**
 * Render the HUD overlay on top of the pitch river.
 * Drawn fresh each frame (not accumulated).
 */
function drawHUDOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  centsFromHome: number,
  chordLabel: string,
  mode: "JI" | "ET",
  homeHz: number,
  currentRootHz: number,
): void {
  const W = canvas.width;
  const H = canvas.height;

  ctx.save();

  // Current-root label (left side, tracks pitch)
  const rootNorm = octaveNorm(currentRootHz, 80, 600);
  const rootY = Math.max(20, Math.min(H - 10, computePitchY(rootNorm, H)));
  ctx.font = "bold 13px 'SF Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(167, 139, 250, 0.90)";
  ctx.textAlign = "left";
  ctx.fillText("◀ root", 6, rootY);

  // Home label (slightly offset from the dim line)
  const homeY = Math.max(20, Math.min(H - 10, computePitchY(homeHz, H)));
  ctx.font = "11px 'SF Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(100, 100, 200, 0.65)";
  ctx.fillText("◀ home 220 Hz", 6, homeY + 16);

  // Cents drift (large, centred, top)
  const absCents = Math.abs(centsFromHome);
  const sign = centsFromHome < 0 ? "−" : "+";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillStyle = absCents > 100
    ? "rgba(251, 113, 133, 0.95)"   // rose  — far from home
    : absCents > 50
    ? "rgba(251, 191, 36, 0.95)"    // amber — drifting
    : "rgba(167, 139, 250, 0.95)";  // violet — near home
  ctx.textAlign = "center";
  ctx.fillText(`${sign}${absCents.toFixed(1)} ¢`, W / 2, 32);

  // Chord label
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.80)";
  ctx.fillText(chordLabel, W / 2, 56);

  // Mode badge (top right)
  ctx.font = "bold 13px 'SF Mono', ui-monospace, monospace";
  ctx.fillStyle = mode === "JI"
    ? "rgba(52, 211, 153, 0.90)"    // emerald — pure
    : "rgba(251, 191, 36, 0.90)";   // amber   — tempered
  ctx.textAlign = "right";
  ctx.fillText(mode === "JI" ? "JI" : "12-TET", W - 10, 26);

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommaPumpPage() {
  const [running, setRunning]           = useState(false);
  const [mode, setMode]                 = useState<"JI" | "ET">("JI");
  const [tempo, setTempo]               = useState(72);
  const [centsFromHome, setCentsFromHome] = useState(0);
  const [chordLabel, setChordLabel]     = useState("—");
  const [audioError, setAudioError]     = useState<string | null>(null);

  const canvasRef      = useRef<HTMLCanvasElement | null>(null);   // pitch river
  const hudCanvasRef   = useRef<HTMLCanvasElement | null>(null);   // HUD overlay
  const engineRef      = useRef<EngineState | null>(null);
  const rafRef         = useRef<number>(0);
  const resizeCleanRef = useRef<(() => void) | null>(null);

  // Live refs — so rAF / setTimeout callbacks always see current values
  const modeRef       = useRef<"JI" | "ET">("JI");
  const tempoRef      = useRef(72);
  const runningRef    = useRef(false);
  const chordLabelRef = useRef("—");
  const centsRef      = useRef(0);

  useEffect(() => { modeRef.current       = mode; },         [mode]);
  useEffect(() => { tempoRef.current      = tempo; },        [tempo]);
  useEffect(() => { runningRef.current    = running; },      [running]);
  useEffect(() => { chordLabelRef.current = chordLabel; },   [chordLabel]);
  useEffect(() => { centsRef.current      = centsFromHome; }, [centsFromHome]);

  // ── Cleanup helpers ─────────────────────────────────────────────────────────

  const stopEngine = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.stepTimer) clearTimeout(eng.stepTimer);
    eng.stepTimer = null;
    eng.synth.releaseAll();
    void eng.synth.close();
    engineRef.current = null;
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (resizeCleanRef.current) {
      resizeCleanRef.current();
      resizeCleanRef.current = null;
    }
  }, []);

  // ── Progression scheduler ───────────────────────────────────────────────────

  const scheduleNextStep = useCallback((eng: EngineState) => {
    const step: ProgressionStep = PROGRESSION[eng.stepIndex];

    // Track cents change from this root move BEFORE octave normalization
    const prevHz = eng.currentRootHz;
    eng.currentRootHz *= step.rootMove;
    // Accumulate the real cents change (including any octave snaps)
    // We track cumulative drift separately so octave-norm doesn't reset it.
    const rawCentsChange = 1200 * Math.log2(eng.currentRootHz / prevHz);
    eng.cumulativeCents += rawCentsChange;

    // Keep in audible register (80–600 Hz) via octave equivalence
    eng.currentRootHz = octaveNorm(eng.currentRootHz, 80, 600);

    const useET = modeRef.current === "ET";
    eng.synth.playChord(eng.currentRootHz, step.chord, useET);

    // Display the cumulative drift (not the octave-normalized Hz drift)
    centsRef.current      = eng.cumulativeCents;
    chordLabelRef.current = step.chord.name;
    setCentsFromHome(eng.cumulativeCents);
    setChordLabel(step.chord.name);

    // Advance to next step (wraps back to 0 after I')
    eng.stepIndex = (eng.stepIndex + 1) % PROGRESSION.length;

    // Schedule next step at the current tempo
    const msPerBeat = (60 / tempoRef.current) * 1000;
    const delayMs   = step.durationBeats * msPerBeat;
    eng.stepTimer = setTimeout(() => {
      if (runningRef.current && engineRef.current === eng) {
        scheduleNextStep(eng);
      }
    }, delayMs);
  }, []);

  // ── rAF render loop ─────────────────────────────────────────────────────────

  const startRenderLoop = useCallback(() => {
    const river  = canvasRef.current;
    const hudCvs = hudCanvasRef.current;
    if (!river || !hudCvs) return;
    const rCtx = river.getContext("2d");
    const hCtx = hudCvs.getContext("2d");
    if (!rCtx || !hCtx) return;

    // Size both canvases to their CSS layout size
    const applyResize = () => {
      const rect = river.getBoundingClientRect();
      const dpr  = Math.min(window.devicePixelRatio || 1, 2);
      const w    = Math.round(rect.width  * dpr);
      const h    = Math.round(rect.height * dpr);
      if (river.width !== w || river.height !== h) {
        river.width  = w;
        river.height = h;
        rCtx.fillStyle = "#080b12";
        rCtx.fillRect(0, 0, w, h);
      }
      hudCvs.width  = w;
      hudCvs.height = h;
    };
    applyResize();
    window.addEventListener("resize", applyResize);
    resizeCleanRef.current = () => window.removeEventListener("resize", applyResize);

    const tick = () => {
      if (!runningRef.current) return;

      const eng        = engineRef.current;
      const voiceFreqs = eng ? eng.synth.getVoiceFreqs() : [];
      const rootHz     = eng ? eng.currentRootHz : HOME_HZ;

      // Pitch river: accumulates — shifts left, draws one new column
      drawPitchRiverColumn(rCtx, river, voiceFreqs, HOME_HZ, rootHz);

      // HUD: cleared each frame so text doesn't ghost
      hCtx.clearRect(0, 0, hudCvs.width, hudCvs.height);
      drawHUDOverlay(
        hCtx, hudCvs,
        centsRef.current,
        chordLabelRef.current,
        modeRef.current,
        HOME_HZ,
        rootHz,
      );

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Start (must be called inside a user gesture) ────────────────────────────

  const handleStart = useCallback(async () => {
    if (running) return;
    setAudioError(null);

    try {
      // Verify Web Audio is available before constructing the engine
      const hasAudio: boolean = !!(
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
      );
      if (!hasAudio) {
        setAudioError("Web Audio API is not available in this browser.");
        return;
      }

      const synth = new SynthEngine();
      await synth.resume();

      const eng: EngineState = {
        synth,
        stepIndex: 0,
        currentRootHz: HOME_HZ,
        cumulativeCents: 0,
        stepTimer: null,
      };
      engineRef.current = eng;

      setRunning(true);
      runningRef.current = true;

      scheduleNextStep(eng);
      startRenderLoop();

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setAudioError(`Audio could not start: ${msg}`);
    }
  }, [running, scheduleNextStep, startRenderLoop]);

  // ── Stop ─────────────────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    setRunning(false);
    runningRef.current = false;
    stopRaf();
    stopEngine();
    setCentsFromHome(0);
    setChordLabel("—");
    centsRef.current      = 0;
    chordLabelRef.current = "—";

    // Clear canvases to resting state
    const river = canvasRef.current;
    if (river) {
      const ctx = river.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#080b12";
        ctx.fillRect(0, 0, river.width, river.height);
      }
    }
    const hud = hudCanvasRef.current;
    if (hud) {
      const ctx = hud.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, hud.width, hud.height);
    }
  }, [stopRaf, stopEngine]);

  // ── JI ⇄ 12-TET toggle ──────────────────────────────────────────────────────

  const handleModeToggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "JI" ? "ET" : "JI";
      modeRef.current = next;
      return next;
    });
    // The progression scheduler reads modeRef on each step,
    // so the next chord will already use the new tuning system.
  }, []);

  // ── Unmount cleanup ──────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopRaf();
      stopEngine();
    };
  }, [stopRaf, stopEngine]);

  // ── Derived display ──────────────────────────────────────────────────────────

  const absCents = Math.abs(centsFromHome);
  const driftSign  = centsFromHome < 0 ? "−" : "+";
  const driftColor =
    absCents > 100 ? "text-violet-400" :
    absCents > 50  ? "text-violet-300" :
                     "text-violet-300";

  return (
    <main className="min-h-screen w-full bg-[#080b12] text-foreground flex flex-col overflow-hidden">

      {/* Back nav */}
      <Link
        href="/dream"
        className="fixed top-4 left-4 z-30 text-base text-muted-foreground hover:text-foreground
                   px-4 py-2.5 rounded-lg bg-muted hover:bg-accent backdrop-blur transition-colors"
      >
        ← dream lab
      </Link>

      {/* Page header */}
      <header className="relative z-10 px-6 pt-20 pb-4 max-w-3xl">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">
          Comma Pump
        </h1>
        <p className="mt-2 text-base text-muted-foreground max-w-xl">
          A long-form generative piece in{" "}
          <span className="text-violet-300">adaptive 5-limit just intonation</span>.
          Every chord is voiced with pure ratios; every root motion is a pure
          interval — so the progression accumulates the{" "}
          <span className="text-violet-300">syntonic comma</span> (81/80, ~21.5 ¢)
          downward per cycle, drifting away from home indefinitely.
          Toggle to 12-TET to hear the beating appear; back to JI and it
          vanishes — that contrast is the point.
        </p>
      </header>

      {/* Canvas — pitch river + HUD overlay */}
      <div className="relative flex-1 min-h-0 mx-6 mb-4 rounded-xl overflow-hidden border border-border"
           style={{ minHeight: 260 }}>
        {/* Layer 1: scrolling pitch river (accumulates) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Layer 2: HUD overlay (cleared and redrawn each frame) */}
        <canvas
          ref={hudCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ imageRendering: "pixelated" }}
        />

        {/* Idle overlay */}
        {!running && !audioError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-base text-muted-foreground select-none">
              Press Start to begin the piece
            </p>
          </div>
        )}

        {/* Audio error notice */}
        {audioError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20
                          text-violet-300 text-base bg-black/70 px-5 py-3
                          rounded-lg max-w-md text-center pointer-events-none">
            {audioError}
          </div>
        )}
      </div>

      {/* Text HUD (mirrors canvas readout for accessibility) */}
      <div className="relative z-10 px-6 mb-4 flex flex-wrap gap-x-8 gap-y-2 items-baseline font-mono">
        <span className="text-muted-foreground text-base">drift</span>
        <span className={`text-2xl font-bold tabular-nums ${driftColor}`}>
          {driftSign}{absCents.toFixed(2)}&thinsp;¢
        </span>
        <span className="text-muted-foreground text-base">from home (A3 = 220 Hz)</span>

        <span className="text-muted-foreground text-base ml-4">chord</span>
        <span className="text-xl text-violet-300">{chordLabel}</span>

        <span className={`ml-4 text-base font-bold ${
          mode === "JI" ? "text-violet-300" : "text-violet-300"
        }`}>
          {mode === "JI" ? "Just Intonation" : "12-TET (equal temperament)"}
        </span>
      </div>

      {/* Controls */}
      <div className="relative z-10 px-6 pb-6 flex flex-wrap gap-3 items-center">

        {!running ? (
          <button
            onClick={() => void handleStart()}
            className="min-h-[44px] px-6 py-2.5 rounded-xl
                       bg-violet-500/30 hover:bg-violet-500/45
                       text-violet-100 border border-violet-400/40
                       text-base font-medium transition-colors"
          >
            ▶ Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="min-h-[44px] px-6 py-2.5 rounded-xl
                       bg-muted hover:bg-accent text-foreground
                       border border-border text-base font-medium transition-colors"
          >
            ■ Stop
          </button>
        )}

        {/* JI ⇄ 12-TET toggle */}
        <button
          onClick={handleModeToggle}
          className={`min-h-[44px] px-4 py-2.5 rounded-xl border
                      text-base font-medium transition-colors ${
            mode === "JI"
              ? "bg-violet-500/20 border-violet-400/40 text-violet-100"
              : "bg-violet-500/20 border-violet-400/40 text-violet-100"
          }`}
        >
          {mode === "JI" ? "JI → 12-TET" : "12-TET → JI"}
        </button>

        {/* Tempo slider */}
        <label className="flex items-center gap-3 text-base text-muted-foreground min-h-[44px]">
          <span>Tempo</span>
          <input
            type="range"
            min={30}
            max={160}
            step={1}
            value={tempo}
            onChange={(e) => setTempo(parseInt(e.target.value, 10))}
            className="w-40 accent-violet-400"
            aria-label="Tempo in BPM"
          />
          <span className="font-mono text-violet-300 tabular-nums w-16 text-base">
            {tempo} bpm
          </span>
        </label>
      </div>

      {/* Visual legend */}
      <div className="relative z-10 px-6 pb-3 flex flex-wrap gap-4 text-base text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block w-8 h-px" style={{ backgroundColor: "rgba(100,100,180,0.4)" }} />
          home tonic (fixed)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-8 h-0.5" style={{ backgroundColor: "rgba(139,92,246,0.8)" }} />
          drifting root
        </span>
        {(["root", "3rd", "5th", "7th"] as const).map((label, i) => (
          <span key={label} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: VOICE_COLORS[i] }}
            />
            {label}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 pb-5 flex justify-between items-center">
        <span className="text-base text-muted-foreground/70">
          cycle 404 · syntonic comma pump · 5-limit JI · zero deps
        </span>
        <span className="text-base text-muted-foreground/70">
          Design notes:{" "}
          <span className="font-mono text-sm text-muted-foreground">
            src/app/dream/404-comma-pump/README.md
          </span>
        </span>
      </div>

    </main>
  );
}
