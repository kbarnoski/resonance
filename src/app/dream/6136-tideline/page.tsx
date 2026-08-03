"use client";

// ─────────────────────────────────────────────────────────────────────────
// Tideline — breathe the sea in and out.
//
// Your slow breath, sensed through the mic as a broadband envelope (not pitch,
// not onsets), paces a warm tidal drone and a luminous horizon that RISES as
// you inhale and falls as you exhale. A soft pace ring guides you, and its
// period slowly lengthens over the session toward the ~6-breaths-per-minute
// resonance frequency of coherent breathing — a drug-free entrainment piece.
//
// No mic permission => "auto-breathe" mode: a synthetic breath LFO drives the
// whole instrument so it still works and is beautiful.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BreathTracker, rmsOf } from "./breath";
import { TideAudio } from "./audio";
import { createTideRenderer, type TideRenderer } from "./render";

type Mode = "idle" | "starting" | "mic" | "auto";

export default function TidelinePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioRef = useRef<TideAudio | null>(null);
  const rendererRef = useRef<TideRenderer | null>(null);
  const trackerRef = useRef<BreathTracker>(new BreathTracker());
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const modeRef = useRef<Mode>("idle");
  const glowRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [renderKind, setRenderKind] = useState<"webgl2" | "canvas2d" | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [phase, setPhase] = useState<"inhale" | "exhale">("inhale");
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Keep the canvas sized to its container.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const r = rendererRef.current;
    if (!canvas || !r) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame);
    const r = rendererRef.current;
    if (!r) return;

    const last = lastTsRef.current || ts;
    let dt = (ts - last) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.1) dt = 0.1; // clamp after a tab-switch stall
    if (dt <= 0) dt = 1 / 60;

    // Read the mic envelope if we have one; else null => auto-breathe.
    let rms: number | null = null;
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (modeRef.current === "mic" && analyser && buf) {
      analyser.getFloatTimeDomainData(buf);
      rms = rmsOf(buf);
    }

    const s = trackerRef.current.update(rms, dt);
    audioRef.current?.breathe(s.level);

    // Glow tracks the breath but eases, so the horizon blooms unhurriedly.
    glowRef.current += (s.level - glowRef.current) * Math.min(1, dt * 2.2);

    r.draw({
      time: ts / 1000,
      breath: s.level,
      target: s.target,
      glow: glowRef.current,
    });

    // Light-touch UI updates (throttled to whole values / phase changes).
    setPhase((p) => (p === s.phase ? p : s.phase));
    const m = Math.floor(s.minutes);
    setMinutes((prev) => (prev === m ? prev : m));
  }, []);

  const begin = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setMode("starting");
    modeRef.current = "starting";
    trackerRef.current.reset();

    // Renderer first, so even if audio/mic hiccup the sea is alive.
    const canvas = canvasRef.current;
    if (canvas && !rendererRef.current) {
      try {
        const r = createTideRenderer(canvas);
        rendererRef.current = r;
        setRenderKind(r.kind);
        resize();
      } catch {
        setRenderKind(null);
      }
    }

    // Audio.
    try {
      const audio = new TideAudio();
      audioRef.current = audio;
      await audio.start();
    } catch {
      audioRef.current = null;
    }

    // Mic — optional. On denial we fall into auto-breathe (a valid mode).
    let gotMic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const ctx = audioRef.current?.ctx;
      if (ctx) {
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.3;
        src.connect(analyser); // analyser only — never routed to output
        analyserRef.current = analyser;
        bufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        gotMic = true;
      }
    } catch {
      gotMic = false;
    }

    setMode(gotMic ? "mic" : "auto");
    modeRef.current = gotMic ? "mic" : "auto";

    lastTsRef.current = 0;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [resize, runFrame]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      bufRef.current = null;
      void audioRef.current?.stop();
      audioRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const started = mode === "mic" || mode === "auto";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060d] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-4 p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tideline
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Breathe near the mic and the sea breathes with you — a tidal drone
            and a glowing horizon that rise and fall on your own slow breath.
          </p>
        </div>
        <Link
          href="/dream"
          className="hidden shrink-0 items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex min-h-[44px]"
        >
          Gallery
        </Link>
      </div>

      {/* Status line under the header */}
      {started && (
        <div className="pointer-events-none relative z-10 px-6">
          {mode === "auto" && (
            <p className="text-sm text-muted-foreground">
              Auto-breathe mode — no microphone, so a gentle synthetic breath is
              pacing the tide. Follow the ring.
            </p>
          )}
          {mode === "mic" && (
            <p className="text-sm text-muted-foreground">
              Listening to your breath. Let the ring lead you — in as it grows,
              out as it shrinks{minutes >= 1 ? ` · ${minutes} min settled` : ""}.
            </p>
          )}
          {renderKind === "canvas2d" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Running in Canvas mode (WebGL2 unavailable).
            </p>
          )}
        </div>
      )}

      {/* Begin overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="max-w-md">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Settle, and breathe with the sea
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              A soft ring will pace you — slower and slower over a few minutes,
              toward the calm of coherent breathing. Breathe near the mic; if you
              prefer, it runs on its own.
            </p>
          </div>
          <button
            onClick={begin}
            disabled={mode === "starting"}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {mode === "starting" ? "Opening…" : "Begin"}
          </button>
        </div>
      )}

      {/* Breath cue at the foot */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-8">
          <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            {phase === "inhale" ? "breathe in" : "breathe out"}
          </p>
        </div>
      )}

      {/* Design notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-6 right-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Read design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-background/70"
            onClick={() => setShowNotes(false)}
          />
          <div className="relative max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Tideline listens for the slowest thing in the room: the swell of
                broadband amplitude as you inhale and exhale near the mic. It is
                not pitch or onset detection — a one-pole envelope smooths the
                signal over roughly a second and self-calibrates against a slow
                floor and ceiling, so any mic gain becomes a clean rise and fall.
              </p>
              <p>
                That envelope is the tide. It lifts the horizon, opens a filtered
                noise &ldquo;surf&rdquo;, and swells a low just-intonation drone —
                inhale brightens and lifts the sea, exhale lets it recede. A soft
                pace ring shows the target breath, and its period lengthens over a
                couple of minutes from about five seconds toward ten, guiding you
                down toward the ~6-breaths-per-minute resonance frequency.
              </p>
              <p>
                Everything moves on the breath timescale — multi-second luminance
                and level drift, never a flash. If you decline the mic it runs in
                auto-breathe mode, pacing itself so the piece is whole either way.
              </p>
              <p>
                References: the coherent-breathing / HRV resonance-frequency
                literature (~0.1 Hz) as the pacing basis, and the durational drone
                lineage — Éliane Radigue, Max Richter&rsquo;s <em>Sleep</em> — as
                the sonic register.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
