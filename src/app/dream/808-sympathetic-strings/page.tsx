"use client";

// ── Sympathetic Strings ───────────────────────────────────────────────────────
// "What if you play or sing into your mic and exactly the right strings ring
//  back — your sound waking an illusory bank of tuned strings that vibrate
//  sympathetically, the way a grand piano's strings ring when you hold the
//  sustain pedal?"
//
// INPUT  : Mic via getUserMedia (echoCancellation:false etc) → AudioWorklet
//          Karplus-Strong resonator bank (48 tuned delay lines).
// OUTPUT : SVG visualization — 48 vertical strings whose glow/wobble tracks
//          per-string ringing energy. Sound via Web Audio API.
// ENGINE : Karplus-Strong tuned-delay-line sympathetic resonator bank, loaded
//          from a Blob URL AudioWorklet. See audio.ts + worklet-source.ts.
// VIBE   : Dark, warm, nocturnal. Adult / live-performance / intimate.
//
// Named references:
//   Electronic Audio Experiments Prismatic Wall (sympathetic string resonator,
//     tuned-delay-line Karplus-Strong, 2026)
//   Karplus-Strong / Jaffe–Smith (CMJ 1983)
//   Sitar tarab / viola d'amore sympathetic strings
//   Henry Cowell string-piano

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { SympathyEngine, buildFreqs, TUNING_MODES, type TuningMode } from "./audio";

// ── Constants ─────────────────────────────────────────────────────────────────
const STRING_COUNT = 48;

// Hue map: low strings warm (amber/orange), mid violet, high cool blue
function stringHue(idx: number, total: number): string {
  const t = idx / (total - 1);
  const hue =
    t < 0.5
      ? 35 + (280 - 35) * (t * 2)
      : 280 + (220 - 280) * ((t - 0.5) * 2);
  return `${hue.toFixed(1)}`;
}

// Compute x position for string i across the SVG width
function stringX(idx: number, total: number, width: number): number {
  const margin = width * 0.03;
  const usable = width - margin * 2;
  return margin + (idx / (total - 1)) * usable;
}

type Phase = "idle" | "starting" | "running";

export default function SympathyStringsPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [ghostMode, setGhostMode] = useState(false);
  const [tuningMode, setTuningMode] = useState<TuningMode>("chromatic");
  const [pedalHeld, setPedalHeld] = useState(false);
  const [svgSize, setSvgSize] = useState({ w: 1200, h: 700 });
  const [audioError, setAudioError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-string levels for visualization (0..1) — written from audio thread callback
  const levelsRef = useRef<Float32Array>(new Float32Array(STRING_COUNT));
  // Smoothed levels for rendering
  const smoothLevelsRef = useRef<Float32Array>(new Float32Array(STRING_COUNT));
  // Animated wobble phases per string
  const wobblePhaseRef = useRef<Float32Array>(
    new Float32Array(STRING_COUNT).map((_, i) => i * 0.37),
  );

  const engineRef = useRef<SympathyEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const pedalRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const stringElemsRef = useRef<SVGLineElement[]>([]);
  const glowElemsRef = useRef<SVGLineElement[]>([]);
  const filterElemsRef = useRef<SVGFEGaussianBlurElement[]>([]);

  const startTimeRef = useRef<number>(0);
  const tuningModeRef = useRef<TuningMode>("chromatic");

  // ── SVG size tracking ───────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      setSvgSize({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ── Sync pedal state to ref (for use in rAF closure) ───────────────────────
  useEffect(() => {
    pedalRef.current = pedalHeld;
  }, [pedalHeld]);

  // ── Spacebar = sustain pedal ────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: globalThis.KeyboardEvent) => {
      if (e.code === "Space" && phase === "running") {
        e.preventDefault();
        if (!pedalRef.current) {
          setPedalHeld(true);
          engineRef.current?.setSustain(true);
        }
      }
    };
    const onUp = (e: globalThis.KeyboardEvent) => {
      if (e.code === "Space") {
        if (pedalRef.current) {
          setPedalHeld(false);
          engineRef.current?.setSustain(false);
        }
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [phase]);

  // ── Animation loop: update SVG string visuals imperatively ──────────────────
  const animateStrings = useCallback(() => {
    rafRef.current = requestAnimationFrame(animateStrings);
    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;
    const smoothLevels = smoothLevelsRef.current;
    const rawLevels = levelsRef.current;
    const wobblePhases = wobblePhaseRef.current;
    const w = svgRef.current?.clientWidth || svgSize.w;

    // Accretion factor: 0 at start → 1 at ~3min; drives slow widening of glow
    const accretion = Math.min(1, elapsed / 180);

    for (let i = 0; i < STRING_COUNT; i++) {
      const raw = rawLevels[i] ?? 0;
      smoothLevels[i] = smoothLevels[i] * 0.85 + raw * 0.15;
      const level = smoothLevels[i];

      // Wobble: phase advances faster for ringing strings
      wobblePhases[i] += 0.04 + level * 0.18;
      const wobble = Math.sin(wobblePhases[i]) * level;
      const x = stringX(i, STRING_COUNT, w);
      const dx = wobble * (4 + accretion * 3);

      const line = stringElemsRef.current[i];
      const glow = glowElemsRef.current[i];
      const blur = filterElemsRef.current[i];
      if (!line || !glow) continue;

      // Sharp string
      const baseOpacity = 0.15 + accretion * 0.08;
      const ringOpacity = Math.min(1, baseOpacity + level * 2.5);
      const strokeWidth = 0.8 + level * 3.5 + accretion * 0.4;
      line.setAttribute("x1", String(x + dx));
      line.setAttribute("x2", String(x + dx * 0.3));
      line.setAttribute("stroke-opacity", String(ringOpacity));
      line.setAttribute("stroke-width", String(strokeWidth));

      // Glow layer
      const glowOpacity = Math.min(0.9, level * 3.0 + accretion * 0.06);
      const glowWidth = 3 + level * 14 + accretion * 1.5;
      glow.setAttribute("x1", String(x + dx * 1.2));
      glow.setAttribute("x2", String(x + dx * 0.5));
      glow.setAttribute("stroke-opacity", String(glowOpacity));
      glow.setAttribute("stroke-width", String(glowWidth));

      // Dynamic blur on glow filter
      if (blur) {
        const blurAmt = 1.5 + level * 8 + accretion * 0.5;
        blur.setAttribute("stdDeviation", String(blurAmt));
      }
    }
  }, [svgSize.w]);

  // ── Start engine ────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("starting");
    startTimeRef.current = performance.now();

    if (
      typeof AudioContext === "undefined" &&
      typeof (window as { webkitAudioContext?: unknown }).webkitAudioContext ===
        "undefined"
    ) {
      setAudioError(true);
      setPhase("idle");
      return;
    }

    const engine = new SympathyEngine();
    engineRef.current = engine;

    engine.setLevelCallback((levels: number[]) => {
      const arr = levelsRef.current;
      for (let i = 0; i < Math.min(levels.length, arr.length); i++) {
        arr[i] = levels[i];
      }
    });

    try {
      const result = await engine.start(tuningModeRef.current);
      setGhostMode(result.ghostMode);
      setPhase("running");
      rafRef.current = requestAnimationFrame(animateStrings);
    } catch (err) {
      console.error("Audio engine failed:", err);
      setErrorMsg("Audio engine could not start. Please try a modern browser.");
      setAudioError(true);
      setPhase("idle");
    }
  }, [phase, animateStrings]);

  // ── Tuning mode change ──────────────────────────────────────────────────────
  const handleTuningChange = useCallback(
    (mode: TuningMode) => {
      setTuningMode(mode);
      tuningModeRef.current = mode;
      if (phase === "running") {
        engineRef.current?.retune(mode);
      }
    },
    [phase],
  );

  // ── Pedal ───────────────────────────────────────────────────────────────────
  const handlePedalDown = useCallback(() => {
    if (phase !== "running") return;
    setPedalHeld(true);
    engineRef.current?.setSustain(true);
  }, [phase]);

  const handlePedalUp = useCallback(() => {
    if (phase !== "running") return;
    setPedalHeld(false);
    engineRef.current?.setSustain(false);
  }, [phase]);

  // ── Click-to-pluck ──────────────────────────────────────────────────────────
  const handleStringClick = useCallback(
    (idx: number) => {
      if (phase !== "running") return;
      engineRef.current?.pluckString(idx, 0.7);
      // Visual kick: immediately boost the level for instant feedback
      levelsRef.current[idx] = Math.min(
        1,
        (levelsRef.current[idx] ?? 0) + 0.5,
      );
    },
    [phase],
  );

  // ── Full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const engine = engineRef.current;
      if (engine) {
        engine.stop();
        engineRef.current = null;
      }
    };
  }, []);

  // ── Pedal button keyboard accessibility ────────────────────────────────────
  const handlePedalKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePedalDown();
      }
    },
    [handlePedalDown],
  );

  const handlePedalKeyUp = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        handlePedalUp();
      }
    },
    [handlePedalUp],
  );

  // ── DOM ref callbacks for imperative SVG animation ─────────────────────────
  const registerLine = useCallback(
    (el: SVGLineElement | null, idx: number, isGlow: boolean) => {
      if (!el) return;
      if (isGlow) {
        glowElemsRef.current[idx] = el;
      } else {
        stringElemsRef.current[idx] = el;
      }
    },
    [],
  );

  const registerBlur = useCallback(
    (el: SVGFEGaussianBlurElement | null, idx: number) => {
      if (!el) return;
      filterElemsRef.current[idx] = el;
    },
    [],
  );

  const { w: svgW, h: svgH } = svgSize;

  // Frequencies for aria-labels on strings
  const freqs = buildFreqs(tuningMode);

  return (
    <main
      className="relative h-[100dvh] w-full overflow-hidden bg-[#08060c] text-white"
      style={{
        fontFamily:
          "ui-monospace, 'Cascadia Code', 'Fira Code', Menlo, monospace",
      }}
    >
      {/* ── SVG String Bank ───────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="none"
        aria-label="Sympathetic string bank visualization"
        role="img"
      >
        <defs>
          {/* Background gradient */}
          <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#08060c" />
            <stop offset="100%" stopColor="#100820" />
          </linearGradient>

          {/* Per-string glow filters */}
          {Array.from({ length: STRING_COUNT }, (_, i) => (
            <filter
              key={i}
              id={`glow-${i}`}
              x="-200%"
              y="-5%"
              width="500%"
              height="110%"
            >
              <feGaussianBlur
                ref={(el) => registerBlur(el, i)}
                in="SourceGraphic"
                stdDeviation="2"
                result="blur"
              />
              <feColorMatrix
                in="blur"
                type="matrix"
                values={`1 0 0 0 ${i % 3 === 0 ? 0.35 : 0.08}
                         0 1 0 0 ${i % 3 === 1 ? 0.18 : 0.04}
                         0 0 1 0 ${i % 3 === 2 ? 0.55 : 0.18}
                         0 0 0 16 -6`}
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Background */}
        <rect width={svgW} height={svgH} fill="url(#bg-grad)" />

        {/* Horizon line */}
        <line
          x1="0"
          y1={svgH * 0.96}
          x2={svgW}
          y2={svgH * 0.96}
          stroke="rgba(180,150,255,0.07)"
          strokeWidth="1"
        />

        {/* Strings */}
        {Array.from({ length: STRING_COUNT }, (_, i) => {
          const x = stringX(i, STRING_COUNT, svgW);
          const hue = stringHue(i, STRING_COUNT);
          const freq = freqs[i] ?? 440;

          return (
            <g
              key={i}
              style={{ cursor: phase === "running" ? "pointer" : "default" }}
            >
              {/* Invisible hit-target for click-to-pluck */}
              {phase === "running" && (
                <line
                  x1={x}
                  y1={svgH * 0.04}
                  x2={x}
                  y2={svgH * 0.96}
                  stroke="transparent"
                  strokeWidth="18"
                  onClick={() => handleStringClick(i)}
                  aria-label={`String ${i + 1}, ${freq.toFixed(1)} Hz`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleStringClick(i);
                  }}
                />
              )}

              {/* Glow layer (wide, soft, feGaussianBlur filter) */}
              <line
                ref={(el) => registerLine(el, i, true)}
                x1={x}
                y1={svgH * 0.04}
                x2={x}
                y2={svgH * 0.96}
                stroke={`hsl(${hue}, 75%, 65%)`}
                strokeWidth="4"
                strokeOpacity="0"
                strokeLinecap="round"
                filter={`url(#glow-${i})`}
                style={{ pointerEvents: "none" }}
              />

              {/* Sharp string layer */}
              <line
                ref={(el) => registerLine(el, i, false)}
                x1={x}
                y1={svgH * 0.04}
                x2={x}
                y2={svgH * 0.96}
                stroke={`hsl(${hue}, 60%, 55%)`}
                strokeWidth="1"
                strokeOpacity="0.15"
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
            </g>
          );
        })}
      </svg>

      {/* ── UI Overlay ────────────────────────────────────────────────────── */}

      {/* Title (top-left) */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Sympathetic Strings
        </h1>
        <p className="mt-1 max-w-sm text-base leading-snug text-white/75">
          Sing or play — the strings that match your pitch ring back.
        </p>
      </div>

      {/* Ghost mode notice */}
      {ghostMode && phase === "running" && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 px-4 text-center sm:top-20">
          <p className="text-base text-rose-300">
            Ghost exciter active — mic unavailable. Click any string to pluck
            it.
          </p>
        </div>
      )}

      {/* Audio error */}
      {audioError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            {errorMsg ??
              "Web Audio API is unavailable. Please try a modern browser like Chrome, Firefox, or Safari."}
          </p>
        </div>
      )}

      {/* Pedal state badge (top-right) */}
      {phase === "running" && (
        <div className="pointer-events-none absolute right-5 top-5 sm:right-7">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-base transition-all ${
              pedalHeld
                ? "border-violet-400/50 bg-violet-900/50 text-violet-300"
                : "border-white/15 bg-black/40 text-white/50"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                pedalHeld ? "bg-violet-300" : "bg-white/30"
              }`}
            />
            {pedalHeld ? "sustain on" : "sustain off"}
          </span>
        </div>
      )}

      {/* Controls (bottom bar) */}
      {phase === "running" && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 pb-6 pt-3">
          {/* Tuning mode selector */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-base text-white/75">Mode:</span>
            {TUNING_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => handleTuningChange(m.id)}
                className={`min-h-[44px] rounded-full border px-4 py-2.5 text-base transition-colors ${
                  tuningMode === m.id
                    ? "border-violet-400/60 bg-violet-900/40 text-violet-300"
                    : "border-white/20 bg-black/40 text-white/75 hover:border-white/40 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Sustain pedal */}
          <div className="flex items-center gap-4">
            <button
              onMouseDown={handlePedalDown}
              onMouseUp={handlePedalUp}
              onTouchStart={(e) => {
                e.preventDefault();
                handlePedalDown();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handlePedalUp();
              }}
              onKeyDown={handlePedalKeyDown}
              onKeyUp={handlePedalKeyUp}
              className={`min-h-[44px] select-none rounded-full border px-6 py-2.5 text-base font-medium transition-all ${
                pedalHeld
                  ? "border-violet-300/80 bg-violet-700/60 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)]"
                  : "border-white/25 bg-black/50 text-white/75 hover:border-white/40"
              }`}
              aria-pressed={pedalHeld}
              aria-label="Sustain pedal — hold to sustain strings"
            >
              {pedalHeld ? "⬛ Pedal Held" : "◻ Hold Pedal"}
            </button>
            <span className="text-base text-white/50">or hold Space</span>
          </div>
        </div>
      )}

      {/* Start screen */}
      {phase === "idle" && !audioError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          <div className="max-w-lg text-center">
            <h2 className="text-xl font-medium text-white">
              A bank of 48 tuned strings, waiting.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/75">
              Sing, hum, or play an instrument near your mic. The strings tuned
              to your pitch ring back sympathetically — like holding a
              piano&apos;s sustain pedal while you play.
            </p>
            <p className="mt-2 text-base text-white/50">
              Hold Space or the on-screen pedal to sustain. Click any string to
              pluck it directly.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-full border border-violet-400/40 bg-violet-900/30 px-6 py-2.5 text-base font-medium text-white backdrop-blur-md transition-colors hover:border-violet-300/60 hover:bg-violet-800/40"
          >
            ▶ Open the Strings
          </button>
        </div>
      )}

      {phase === "starting" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-base text-white/75">Tuning strings…</p>
        </div>
      )}

      {/* Design notes link (visible on idle) */}
      {phase !== "running" && (
        <a
          href="#notes"
          className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-white/15 bg-black/50 px-4 py-2.5 text-base text-white/75 backdrop-blur-md transition-colors hover:text-white"
        >
          Design notes
        </a>
      )}

      {/* ── In-page design notes ──────────────────────────────────────────── */}
      <section
        id="notes"
        className="absolute left-0 top-full w-full bg-[#08060c] px-6 py-12 sm:px-10"
      >
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold text-white">
            Design notes — Sympathetic Strings
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "INPUT: mic / ghost exciter",
              "OUTPUT: SVG + audio",
              "TECHNIQUE: Karplus-Strong delay lines",
              "VIBE: dark · nocturnal · intimate",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded border border-violet-500/30 px-2 py-0.5 text-base text-violet-300"
              >
                {tag}
              </span>
            ))}
          </div>

          <p className="mt-6 text-base leading-relaxed text-white/80">
            The piece models a bank of 48 tuned sympathetic strings — the kind
            found inside a sitar (where they are called <em>tarab</em>) or a
            viola d&apos;amore, and evoked by Henry Cowell&apos;s string-piano
            preparations. When you hold the sustain pedal on a grand piano and
            sing into it, the strings tuned to your pitch vibrate without being
            struck: the air pressure alone excites them. This is that
            experience, made tangible in browser audio.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/80">
            <strong className="text-white">Technique:</strong> Each string is a
            Karplus-Strong tuned delay line — a circular buffer of length{" "}
            <code className="rounded bg-white/10 px-1 text-violet-300">
              L = round(sampleRate / freq)
            </code>
            , with a one-pole lowpass loop filter (averaging current and
            previous output) and a feedback coefficient strictly below 1. This
            is the architecture behind the Electronic Audio Experiments{" "}
            <em>Prismatic Wall</em> (2026): a bank of delay lines each tuned to
            a different pitch, continuously excited by whatever signal enters
            the input. Energy from your microphone enters all 48 delay lines
            simultaneously; a spectral analysis step scales each string&apos;s
            excitation by how much FFT energy exists near that string&apos;s
            frequency — so strings tuned to what you play ring loudly.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/80">
            <strong className="text-white">Long-form accretion:</strong> With
            the sustain pedal held (Space or the on-screen button), the
            feedback coefficient rises to 0.997 — an almost-lossless loop.
            Energy injected in second 10 is still circulating at minute 3, and
            new energy from the mic stacks on top. The bank is genuinely fuller
            at minute 3 than at second 10 — state is real delay-line energy,
            not a loop.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/80">
            <strong className="text-white">Audio safety chain:</strong> The mic
            source is never connected to the audio destination, preventing
            acoustic feedback howl. Worklet feedback is clamped to ≤ 0.999. A
            DynamicsCompressor (ratio 20:1, threshold −18 dB) sits between the
            worklet and the destination as a hard limiter.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/80">
            <strong className="text-white">Tuning modes:</strong>{" "}
            <em>Chromatic</em> — 48 semitones across the piano range (A0–C8).{" "}
            <em>Stacked Fifths</em> — 48 pure 3:2 fifths from C2, a Pythagorean
            spiral. <em>Overtone Series</em> — harmonic series of A0 with
            octave doublings, emphasising brass-natural intervals.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/80">
            <strong className="text-white">Visualization:</strong> 48 vertical
            SVG lines. Each has a sharp layer and a wide glow layer with{" "}
            <code className="rounded bg-white/10 px-1 text-violet-300">
              feGaussianBlur
            </code>{" "}
            (dynamic stdDeviation). Per-string RMS energy is reported from the
            AudioWorklet via{" "}
            <code className="rounded bg-white/10 px-1 text-violet-300">
              port.postMessage
            </code>{" "}
            at ~15 fps; the SVG is updated imperatively inside{" "}
            <code className="rounded bg-white/10 px-1 text-violet-300">
              requestAnimationFrame
            </code>{" "}
            to avoid React re-renders. Color maps low strings to amber-orange,
            mid to violet, high to cool blue.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/80">
            <strong className="text-white">References:</strong>{" "}
            Electronic Audio Experiments <em>Prismatic Wall</em> (sympathetic
            string resonator, tuned-delay-line Karplus-Strong, 2026); Kevin
            Karplus &amp; Alex Strong / David A. Jaffe &amp; Julius O. Smith,
            &ldquo;Extensions of the Karplus-Strong Plucked-String
            Algorithm,&rdquo; <em>Computer Music Journal</em> 7(2), 1983;
            sitar <em>tarab</em> sympathetic strings / viola d&apos;amore;
            Henry Cowell string-piano preparations.
          </p>

          <p className="mt-4 text-base text-white/50">
            Mic stays on-device. Nothing is recorded or transmitted. All
            processing is local, in your browser.
          </p>
        </div>
      </section>
    </main>
  );
}
