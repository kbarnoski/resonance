"use client";

// 1310-piano-duet — "Sing Into His Piano".
//
// THE ONE QUESTION: What if you could sing INTO Karel's *recorded* piano —
// your live voice reshaping his harmonics in real time, a duet with a
// recording?
//
// Karel's real solo piano (his album *Welcome Home*) plays as the CARRIER. A
// bank of 20 parallel bandpass filters splits it into log-spaced bands; each
// band's gain is driven by the matching band of YOUR live mic. Hum "ahh" vs
// "ooo" and his chord morphs its timbre toward your vowel — a channel-vocoder
// cross-synthesis on a real recording. The raw mic never reaches the speakers.
//
// Lineage: Trevor Wishart (cross-synthesis / *Vox* / spectral morphing) and
// Robert Henke / Monolake (live spectral practice). See README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { createEngine, N_BANDS, type CrossSynthEngine, type EngineFrame } from "./engine";
import type { SourceKind } from "./audio";

type Phase = "idle" | "loading" | "ready" | "error";

const F_MIN = 60;
const F_MAX = 8000;

/** Log-frequency → x in [0,1]. */
function freqToX(hz: number): number {
  const lo = Math.log(F_MIN);
  const hi = Math.log(F_MAX);
  return (Math.log(Math.max(F_MIN, Math.min(F_MAX, hz))) - lo) / (hi - lo);
}

/** Draw one analyser byte-spectrum as a filled ridge on a log-freq x-axis. */
function drawSpectrum(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  bytes: Uint8Array,
  sampleRate: number,
  stroke: string,
  fill: string | null,
  gain: number,
) {
  const binHz = sampleRate / 2 / bytes.length;
  g.beginPath();
  let started = false;
  // Sample across x in pixel steps, reading the loudest bin near each x.
  const step = 2;
  for (let px = 0; px <= w; px += step) {
    const xNorm = px / w;
    const hz = Math.exp(Math.log(F_MIN) + xNorm * (Math.log(F_MAX) - Math.log(F_MIN)));
    const bin = Math.round(hz / binHz);
    const lo = Math.max(0, bin - 1);
    const hiB = Math.min(bytes.length - 1, bin + 1);
    let v = 0;
    for (let b = lo; b <= hiB; b++) v = Math.max(v, bytes[b]);
    const mag = Math.min(1, (v / 255) * gain);
    const y = h - mag * h * 0.86 - h * 0.06;
    if (!started) {
      g.moveTo(px, y);
      started = true;
    } else {
      g.lineTo(px, y);
    }
  }
  g.strokeStyle = stroke;
  g.lineWidth = 1.6;
  g.stroke();
  if (fill) {
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }
}

/** Draw the per-band voice/applied envelope as a smooth ridge. */
function drawEnvelope(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  env: number[],
  bandHz: (i: number) => number,
  stroke: string,
  fill: string | null,
  lineWidth: number,
) {
  g.beginPath();
  for (let i = 0; i < env.length; i++) {
    const x = freqToX(bandHz(i)) * w;
    const y = h - env[i] * h * 0.82 - h * 0.06;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokeStyle = stroke;
  g.lineWidth = lineWidth;
  g.lineJoin = "round";
  g.stroke();
  if (fill) {
    g.lineTo(freqToX(bandHz(env.length - 1)) * w, h);
    g.lineTo(freqToX(bandHz(0)) * w, h);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }
}

function pct(v: number): number {
  return Math.round(v * 100);
}

export default function PianoDuetPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [usingMic, setUsingMic] = useState(false);
  const [mix, setMix] = useState(0.7);
  const [ui, setUi] = useState({ loudness: 0, singing: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CrossSynthEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const mixRef = useRef(mix);
  const reducedMotionRef = useRef(false);
  // XY-pad state (used only when there is no mic).
  const padRef = useRef<{ peak: number; width: number; energy: number; active: boolean }>({
    peak: 0.5,
    width: 0.16,
    energy: 0.6,
    active: false,
  });
  const uiTickRef = useRef(0);

  useEffect(() => {
    mixRef.current = mix;
  }, [mix]);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const renderLoop = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cw;
    const h = ch;

    const hasMicNow = engine.usingMic();
    // Only hand the engine a manual envelope while the XY pad is actively
    // dragged; otherwise it runs its own gentle auto-morph so a hands-off,
    // mic-less view is alive immediately (never static).
    const manual =
      !hasMicNow && padRef.current.active
        ? { peak: padRef.current.peak, width: padRef.current.width, energy: padRef.current.energy }
        : null;

    const frame: EngineFrame | null = engine.tick({ mix: mixRef.current, manual });

    // Slow, non-strobing fade of the previous frame (trails, not flicker).
    g.fillStyle = reducedMotionRef.current ? "rgba(8,7,16,0.55)" : "rgba(8,7,16,0.30)";
    g.fillRect(0, 0, w, h);

    if (frame) {
      const sr = engine.sampleRate();

      // 1) Karel's piano spectrum — violet/indigo filaments (the carrier).
      drawSpectrum(
        g,
        w,
        h,
        frame.pianoSpectrum,
        sr,
        "rgba(167,139,250,0.85)",
        "rgba(124,58,237,0.10)",
        1.15,
      );

      // 3) The cross-synthesized OUTPUT — brightest, where your voice carves.
      drawSpectrum(
        g,
        w,
        h,
        frame.outputSpectrum,
        sr,
        "rgba(233,213,255,0.95)",
        "rgba(216,180,254,0.06)",
        1.15,
      );

      // 2) Your live voice / sculpt envelope — amber/rose ridge, on top.
      drawEnvelope(
        g,
        w,
        h,
        frame.voice,
        engine.bandHz,
        "rgba(251,191,150,0.30)",
        null,
        1.4,
      );
      drawEnvelope(
        g,
        w,
        h,
        frame.applied,
        engine.bandHz,
        "rgba(253,164,175,0.95)",
        "rgba(251,113,133,0.08)",
        2.2,
      );

      // VU meter (left) — slow, no strobe.
      const vuH = Math.min(1, frame.loudness) * h * 0.7;
      g.fillStyle = "rgba(253,186,116,0.55)";
      g.fillRect(6, h - 8 - vuH, 6, vuH);

      // Throttle React state updates (viz stays on rAF).
      uiTickRef.current += 1;
      if (uiTickRef.current % 6 === 0) {
        setUi({ loudness: frame.loudness, singing: frame.singing });
      }
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const begin = useCallback(async () => {
    setPhase("loading");
    setErrorMsg(null);
    try {
      const engine = createEngine();
      engineRef.current = engine;
      const { source } = await engine.start();
      setSourceKind(source);
      setUsingMic(engine.usingMic());
      setMicError(engine.micError());
      setPhase("ready");
      rafRef.current = requestAnimationFrame(renderLoop);
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Could not start audio. Reload and try again.",
      );
      setPhase("error");
    }
  }, [renderLoop]);

  const end = useCallback(async () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    await engineRef.current?.stop();
    engineRef.current = null;
    setPhase("idle");
    setSourceKind(null);
    setUsingMic(false);
    setUi({ loudness: 0, singing: 0 });
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      void engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // XY-pad pointer handling (fallback when there is no mic).
  const onPadMove = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || usingMic) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const p = padRef.current;
    p.peak = x; // formant center across the spectrum
    p.width = 0.08 + (1 - y) * 0.22; // higher = narrower vowel
    p.energy = 0.35 + (1 - y) * 0.6; // higher = stronger sculpt
  }, [usingMic]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08070f] text-foreground">
      {/* Visualization canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          if (usingMic) return;
          padRef.current.active = true;
          onPadMove(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (padRef.current.active) onPadMove(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          padRef.current.active = false;
        }}
        onPointerLeave={() => {
          padRef.current.active = false;
        }}
      />

      {/* Corner link → design notes */}
      <a
        href="/dream/1310-piano-duet/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes ↗
      </a>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        {/* Header */}
        <header className="max-w-2xl">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Sing Into His Piano
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Karel&apos;s real recorded piano — his album{" "}
            <span className="text-violet-300">Welcome Home</span> — keeps playing.
            Your live voice becomes the sculptor: a bank of 20 filters lets each
            band of your{" "}
            <span className="text-violet-300">vowel</span> boost or carve the same
            band of his chord. Hum &ldquo;ahh,&rdquo; then &ldquo;ooo,&rdquo; and
            his harmonics morph toward you. A duet with a recording.
          </p>

          {sourceKind && (
            <p className="mt-3 font-mono text-sm">
              carrier:{" "}
              <span
                className={
                  sourceKind === "piano"
                    ? "rounded bg-violet-500/15 px-2 py-0.5 text-violet-300"
                    : "rounded bg-violet-500/15 px-2 py-0.5 text-violet-300"
                }
              >
                {sourceKind === "piano" ? "Karel's real piano" : "fallback synth piano"}
              </span>{" "}
              <span
                className={
                  usingMic
                    ? "ml-1 rounded bg-violet-500/15 px-2 py-0.5 text-violet-300"
                    : "ml-1 rounded bg-muted px-2 py-0.5 text-muted-foreground"
                }
              >
                {usingMic ? "mic live" : "auto-morph / drag to sculpt"}
              </span>
            </p>
          )}

          {micError && <p className="mt-2 text-base text-violet-300">{micError}</p>}
          {errorMsg && <p className="mt-2 text-base text-violet-300">{errorMsg}</p>}
        </header>

        {/* Center: start / loading */}
        <section className="flex flex-col items-start gap-3">
          {phase === "idle" && (
            <button
              onClick={() => void begin()}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Start &amp; sing into his piano
            </button>
          )}
          {phase === "loading" && (
            <p className="font-mono text-base text-muted-foreground">
              loading Karel&apos;s carrier + opening the mic…
            </p>
          )}
          {phase === "error" && (
            <button
              onClick={() => setPhase("idle")}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
            >
              Try again
            </button>
          )}
        </section>

        {/* Footer: live readout + controls */}
        {phase === "ready" && (
          <footer className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    ui.singing > 0.25
                      ? "bg-violet-400"
                      : ui.loudness > 0.05
                        ? "bg-violet-400"
                        : "bg-muted"
                  }`}
                />
                {usingMic
                  ? ui.singing > 0.25
                    ? "singing detected"
                    : "listening"
                  : "auto-morph"}
              </span>
              <span>
                voice level <span className="text-violet-300/95">{pct(ui.loudness)}%</span>
              </span>
              <span>
                sculpt <span className="text-violet-300">{pct(ui.singing)}%</span>
              </span>
              <span className="text-muted-foreground">
                {N_BANDS}-band cross-synthesis · violet = his piano · rose = your
                vowel · bright = the blend
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="mix"
                className="font-mono text-sm text-muted-foreground"
              >
                sculpt intensity{" "}
                <span className="text-violet-300">{pct(mix)}%</span>{" "}
                <span className="text-muted-foreground">
                  (louder singing pushes it further)
                </span>
              </label>
              <input
                id="mix"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={mix}
                onChange={(e) => setMix(parseFloat(e.target.value))}
                className="h-2 w-full max-w-md cursor-pointer accent-violet-400"
              />
            </div>

            {!usingMic && (
              <p className="max-w-2xl text-base text-muted-foreground">
                No mic — <span className="text-violet-300">drag anywhere</span> on the
                field: left/right moves the vowel formant across his spectrum,
                up/down sharpens it and pushes the sculpt harder.
              </p>
            )}

            <div>
              <button
                onClick={() => void end()}
                className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                Stop
              </button>
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}
