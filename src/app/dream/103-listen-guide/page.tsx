"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const BAND_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const BAND_RANGES: ReadonlyArray<readonly [number, number]> = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 4000], [4000, 20000],
];

const SHORT_LABELS = ["Sub", "Bass", "LoMid", "Mid", "HiMid", "High"] as const;

const LENSES = [
  {
    name: "Sub-Bass",
    range: "20 – 60 Hz",
    prompt: "Feel the lowest foundation — the weight beneath everything.",
    detail:
      "These frequencies are felt more than heard. The physical presence of the piano's deepest strings — the room itself vibrating at a frequency below clear pitch.",
  },
  {
    name: "Bass",
    range: "60 – 250 Hz",
    prompt: "Follow the warmth and body of the piano.",
    detail:
      "Where the instrument's weight lives. Notice how each note blooms from attack into sustain — that thickness, that warmth, is the bass register at work.",
  },
  {
    name: "Low Midrange",
    range: "250 – 500 Hz",
    prompt: "Listen for the wood and resonance of the instrument.",
    detail:
      "The body of the piano — a hollow, intimate presence. The sound of the wooden cabinet responding to the vibration of the strings.",
  },
  {
    name: "Midrange",
    range: "500 Hz – 2 kHz",
    prompt: "This is where the melody lives — the voice of the music.",
    detail:
      "Human hearing is most sensitive here. The phrase, the intention, the gesture — all are most vivid in the midrange. This is the frequency of the human voice.",
  },
  {
    name: "High Midrange",
    range: "2 – 4 kHz",
    prompt: "Notice the clarity — how each note's edges are defined.",
    detail:
      "The piano's attack: the initial hammer-on-string moment that tells you exactly where each note begins. Presence, articulation, and definition.",
  },
  {
    name: "Treble",
    range: "4 – 20 kHz",
    prompt: "Hear the shimmer and air around each note.",
    detail:
      "The overtones that give piano its brightness and space. The room's reflection. The sensation of air moving. What disappears first with age and hearing loss.",
  },
] as const;

const LENS_DURATION_S = 22;
const TOTAL_DURATION_S = LENS_DURATION_S * LENSES.length; // 132s

// ─── Demo audio helpers (module scope — no use* naming) ─────────────────────

function noteHz(semitones: number, base = 261.63): number {
  return base * Math.pow(2, semitones / 12);
}

function scheduleNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  start: number,
  dur: number,
  gainPeak = 0.18
) {
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const flt = ctx.createBiquadFilter();
  const env = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.value = freq;
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  flt.type = "lowpass";
  flt.frequency.value = Math.min(6000, freq * 12);

  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gainPeak, start + 0.025);
  env.gain.exponentialRampToValueAtTime(gainPeak * 0.55, start + 0.4);
  env.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(dur, 0.1));

  osc.connect(flt);
  osc2.connect(flt);
  flt.connect(env);
  env.connect(dest);

  const end = start + dur + 0.12;
  osc.start(start);
  osc.stop(end);
  osc2.start(start);
  osc2.stop(end);
}

function buildDemoAudio(ctx: AudioContext, dest: AudioNode) {
  const now = ctx.currentTime;
  const dur = TOTAL_DURATION_S + 4;
  const beat = 60 / 54; // 54 BPM ≈ peaceful pace

  // ── Sub-bass pad (40 Hz pure sine — felt, not heard) ──────────────────────
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sine";
  subOsc.frequency.value = 40;
  subGain.gain.value = 0.20;
  subOsc.connect(subGain);
  subGain.connect(dest);
  subOsc.start(now);
  subOsc.stop(now + dur);

  // ── Bass line (C2–G2, 65–98 Hz) ──────────────────────────────────────────
  const bassPattern: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, beat * 4, 0.25],        // C2 (noteHz(-24))
    [0, beat * 4, beat * 4, 0.25],
    [7, beat * 8, beat * 4, 0.22], // G2
    [5, beat * 12, beat * 4, 0.22],// F2
    [0, beat * 16, beat * 4, 0.25],
    [7, beat * 20, beat * 4, 0.22],
    [5, beat * 24, beat * 4, 0.22],
    [0, beat * 28, beat * 8, 0.25],
  ];
  const bassPeriod = beat * 32;
  const bassReps = Math.ceil(dur / bassPeriod) + 1;
  for (let r = 0; r < bassReps; r++) {
    for (const [semi, t, d, g] of bassPattern) {
      const st = now + r * bassPeriod + t;
      if (st >= now + dur) continue;
      scheduleNote(ctx, dest, noteHz(semi - 24), st, d, g);
    }
  }

  // ── Melody (low-mid + mid, C4–A4) ────────────────────────────────────────
  const melodyPattern: ReadonlyArray<readonly [number, number, number, number]> = [
    [0,  0,        beat * 1.5, 0.16], // C4
    [4,  beat * 2, beat * 1.5, 0.15], // E4
    [7,  beat * 4, beat * 2,   0.17], // G4
    [4,  beat * 6, beat * 1.5, 0.15], // E4
    [2,  beat * 8, beat * 1.5, 0.14], // D4
    [0,  beat * 9.5, beat,     0.13], // C4
    [-5, beat * 10.5, beat * 1.5, 0.14], // G3
    [0,  beat * 12, beat * 4,  0.16], // C4 long
    [5,  beat * 16, beat * 1.5, 0.15],// F4
    [4,  beat * 17.5, beat,    0.14], // E4
    [2,  beat * 18.5, beat,    0.13], // D4
    [0,  beat * 19.5, beat * 2, 0.16],// C4
    [7,  beat * 21.5, beat * 1.5, 0.15],// G4
    [9,  beat * 23, beat,      0.14], // A4
    [7,  beat * 24, beat * 2,  0.15], // G4
    [5,  beat * 26, beat,      0.13], // F4
    [4,  beat * 27, beat,      0.12], // E4
    [0,  beat * 28, beat * 4,  0.16], // C4 long
  ];
  const melodyPeriod = beat * 32;
  const melodyReps = Math.ceil(dur / melodyPeriod) + 1;
  for (let r = 0; r < melodyReps; r++) {
    for (const [semi, t, d, g] of melodyPattern) {
      const st = now + r * melodyPeriod + t;
      if (st >= now + dur) continue;
      scheduleNote(ctx, dest, noteHz(semi), st, d, g);
    }
  }

  // ── High-mid sparkle (C5–C6, overtones reach 2–4 kHz) ───────────────────
  const sparklePattern: ReadonlyArray<readonly [number, number, number, number]> = [
    [12, beat * 3,  beat * 0.4, 0.07],  // C5
    [19, beat * 7,  beat * 0.4, 0.06],  // G5
    [16, beat * 11, beat * 0.4, 0.06],  // E5
    [12, beat * 15, beat * 0.4, 0.06],  // C5
    [24, beat * 19, beat * 0.4, 0.05],  // C6
    [19, beat * 23, beat * 0.4, 0.05],  // G5
    [24, beat * 27, beat * 0.4, 0.05],  // C6
    [28, beat * 31, beat * 0.4, 0.04],  // E6
  ];
  const sparklePeriod = beat * 32;
  const sparkleReps = Math.ceil(dur / sparklePeriod) + 1;
  for (let r = 0; r < sparkleReps; r++) {
    for (const [semi, t, d, g] of sparklePattern) {
      const st = now + r * sparklePeriod + t;
      if (st >= now + dur) continue;
      scheduleNote(ctx, dest, noteHz(semi), st, d, g);
    }
  }

  // ── Treble shimmer (C7–G7; triangle harmonics reach 4–14 kHz) ────────────
  const shimmerPattern: ReadonlyArray<readonly [number, number, number, number]> = [
    [36, beat * 5,  beat * 0.3, 0.03],  // C7
    [43, beat * 13, beat * 0.3, 0.025], // G7
    [36, beat * 21, beat * 0.3, 0.025], // C7
    [40, beat * 29, beat * 0.3, 0.02],  // E7
  ];
  const shimmerPeriod = beat * 32;
  const shimmerReps = Math.ceil(dur / shimmerPeriod) + 1;
  for (let r = 0; r < shimmerReps; r++) {
    for (const [semi, t, d, g] of shimmerPattern) {
      const st = now + r * shimmerPeriod + t;
      if (st >= now + dur) continue;
      scheduleNote(ctx, dest, noteHz(semi), st, d, g);
    }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

type Mode = "idle" | "playing" | "done";

export default function ListenGuide() {
  const [mode, setMode] = useState<Mode>("idle");
  const [lensIdx, setLensIdx] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef(0);
  const startTimeRef = useRef(0);
  const prevLensRef = useRef(-1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const bandElsRef = useRef<(HTMLDivElement | null)[]>([]);

  const initAudio = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    } else if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const wireAnalyser = useCallback((source: AudioNode | null) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    analyserRef.current = analyser;

    if (source) {
      source.connect(analyser);
    } else {
      const gain = ctx.createGain();
      gain.connect(analyser);
      buildDemoAudio(ctx, gain);
    }
    analyser.connect(ctx.destination);
    startTimeRef.current = ctx.currentTime;
    prevLensRef.current = -1;
    setMode("playing");
  }, []);

  const startDemo = useCallback(() => {
    initAudio();
    wireAnalyser(null);
  }, [initAudio, wireAnalyser]);

  const loadFile = useCallback(
    async (file: File) => {
      if (
        !/\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name) &&
        !file.type.startsWith("audio/")
      ) {
        setError("Please drop an audio file (.mp3, .m4a, .wav, etc.)");
        return;
      }
      setError(null);
      setFileName(file.name);
      try {
        const ctx = initAudio();
        const buf = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(buf);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = audioBuffer.duration < TOTAL_DURATION_S;
        source.start(ctx.currentTime);
        source.stop(ctx.currentTime + TOTAL_DURATION_S + 2);
        wireAnalyser(source);
      } catch (e) {
        setError(
          `Could not decode audio: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    },
    [initAudio, wireAnalyser]
  );

  // Animation + lens advance — runs while mode === "playing"
  useEffect(() => {
    if (mode !== "playing") return;
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !ctx) return;
    // Capture narrowed refs so closures (renderFrame) see non-null types.
    const an = analyser;
    const ac = ctx;
    const canvas = canvasRef.current;
    const c = canvas?.getContext("2d") ?? null;

    const freqData = new Float32Array(an.frequencyBinCount);
    const binHz = ac.sampleRate / an.fftSize;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = 0;
    let ch = 0;

    function resizeCanvas() {
      if (!canvas || !c) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = window.innerWidth;
      ch = window.innerHeight;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function renderFrame() {
      animRef.current = requestAnimationFrame(renderFrame);

      const elapsed = ac.currentTime - startTimeRef.current;
      const rawLens = Math.floor(elapsed / LENS_DURATION_S);
      const clampedLens = Math.min(rawLens, LENSES.length - 1);
      const progress = Math.min(
        1,
        (elapsed % LENS_DURATION_S) / LENS_DURATION_S
      );

      if (clampedLens !== prevLensRef.current) {
        prevLensRef.current = clampedLens;
        setLensIdx(clampedLens);
      }

      if (progressBarRef.current) {
        const [r, g, b] = BAND_COLORS[clampedLens];
        progressBarRef.current.style.width = `${progress * 100}%`;
        progressBarRef.current.style.background = `rgb(${r},${g},${b})`;
      }

      if (elapsed >= TOTAL_DURATION_S) {
        setMode("done");
        return;
      }

      an.getFloatFrequencyData(freqData);
      const bandEnergies = BAND_RANGES.map(([lo, hi]) => {
        const s = Math.max(1, Math.floor(lo / binHz));
        const e = Math.min(freqData.length - 1, Math.ceil(hi / binHz));
        let sum = 0;
        let n = 0;
        for (let i = s; i <= e; i++) {
          const db = freqData[i];
          if (db > -100) {
            sum += Math.pow(10, db / 20);
            n++;
          }
        }
        return Math.min(1, n > 0 ? (sum / n) * 8 : 0);
      });

      bandElsRef.current.forEach((el, i) => {
        if (!el) return;
        const active = i === clampedLens;
        const done = i < clampedLens;
        el.style.height = `${Math.max(4, bandEnergies[i] * 42)}px`;
        el.style.opacity = active ? "1" : done ? "0.35" : "0.12";
      });

      if (c) {
        c.fillStyle = "rgba(0,0,0,0.14)";
        c.fillRect(0, 0, cw, ch);

        const cx = cw / 2;
        const cy = ch * 0.42;
        const maxR = Math.min(cw, ch) * 0.46;

        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < bandEnergies.length; i++) {
          const energy = bandEnergies[i];
          const focused = i === clampedLens;
          const alphaBase = focused
            ? 0.18 + energy * 1.15
            : 0.02 + energy * 0.11;
          const alpha = Math.min(0.95, alphaBase);
          if (alpha <= 0.005) continue;

          const ringOuter = maxR * (1 - i / bandEnergies.length);
          const ringInner = maxR * (1 - (i + 1) / bandEnergies.length);
          const [r, g, b] = BAND_COLORS[i];
          const expand = focused ? 0.18 * energy : 0.05 * energy;

          const grad = c.createRadialGradient(
            cx, cy, ringInner * 0.65,
            cx, cy, ringOuter * (1 + expand)
          );
          grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          c.fillStyle = grad;
          c.beginPath();
          c.arc(cx, cy, ringOuter * (1 + expand), 0, Math.PI * 2);
          c.fill();
        }
        c.globalCompositeOperation = "source-over";
      }
    }

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [mode]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const resetSession = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    prevLensRef.current = -1;
    setLensIdx(0);
    setFileName(null);
    setError(null);
    setMode("idle");
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragOver(false), []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) loadFile(f);
    },
    [loadFile]
  );

  const lens = LENSES[lensIdx];
  const [lr, lg, lb] = BAND_COLORS[lensIdx];

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100vh - 3rem)" }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 border-2 border-violet-400/60 pointer-events-none">
          <p className="text-violet-300 text-xl tracking-wide">
            Drop to start listening
          </p>
        </div>
      )}

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <p className="text-xs tracking-[0.25em] uppercase text-white/55 mb-3 font-mono">
            Guided listening
          </p>
          <h1 className="text-3xl md:text-4xl mb-3 tracking-tight">
            Hear the layers.
          </h1>
          <p className="text-white/75 text-base max-w-md mb-2 leading-relaxed">
            Six 22-second windows. Each one focuses your attention on a
            different frequency register — from the deepest sub-bass to the
            highest shimmer.
          </p>
          <p className="text-white/55 text-sm max-w-sm mb-8 leading-relaxed">
            Use demo mode, or drop in any audio file. Headphones recommended.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center mb-4">
            <button
              onClick={startDemo}
              className="px-6 py-3 min-h-[44px] text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Demo mode
            </button>
            <label className="px-6 py-3 min-h-[44px] text-sm tracking-wider uppercase border border-violet-400/40 text-violet-300 rounded hover:bg-violet-500/10 hover:border-violet-400/70 transition cursor-pointer flex items-center gap-2">
              Load audio file
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
            </label>
          </div>

          <p className="text-white/35 text-xs mb-8">
            or drag an audio file anywhere on this page
          </p>
          {error && (
            <p className="text-rose-300 text-sm mb-4 max-w-sm">{error}</p>
          )}

          <Link
            href="/dream"
            className="text-xs text-white/30 hover:text-white/55 transition"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── PLAYING ──────────────────────────────────────────────────────── */}
      {mode === "playing" && (
        <div className="absolute inset-0 flex flex-col justify-between z-10 p-5 pointer-events-none">
          {/* Top bar */}
          <div className="flex justify-between items-start">
            <p className="text-white/40 text-xs font-mono truncate max-w-xs">
              {fileName ?? "demo"}
            </p>
            <p className="text-white/40 text-xs font-mono">
              {lensIdx + 1}&thinsp;/&thinsp;{LENSES.length}
            </p>
          </div>

          {/* Center — lens text */}
          <div className="flex flex-col items-center text-center px-4">
            <p
              className="text-xs tracking-[0.25em] uppercase font-mono mb-3"
              style={{ color: `rgb(${lr},${lg},${lb})` }}
            >
              {lens.name}&ensp;·&ensp;{lens.range}
            </p>
            <p className="text-white text-2xl md:text-3xl font-light leading-snug mb-4 max-w-xl">
              {lens.prompt}
            </p>
            <p className="text-white/75 text-base leading-relaxed max-w-lg">
              {lens.detail}
            </p>
          </div>

          {/* Bottom — progress + band bars */}
          <div className="flex flex-col gap-4">
            <div className="w-full h-px bg-white/10 rounded-full overflow-hidden">
              <div
                ref={progressBarRef}
                className="h-full rounded-full"
                style={{
                  width: "0%",
                  background: `rgb(${lr},${lg},${lb})`,
                }}
              />
            </div>

            <div className="flex justify-center gap-3 items-end">
              {LENSES.map((l, i) => {
                const [r, g, b] = BAND_COLORS[i];
                const active = i === lensIdx;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      ref={(el) => {
                        bandElsRef.current[i] = el;
                      }}
                      style={{
                        width: 10,
                        height: 4,
                        background: `rgb(${r},${g},${b})`,
                        opacity: active ? 1 : 0.12,
                        borderRadius: 2,
                        transition: "opacity 500ms",
                      }}
                    />
                    <span
                      className="text-[9px] font-mono tracking-wider"
                      style={{
                        color:
                          active
                            ? `rgb(${r},${g},${b})`
                            : i < lensIdx
                            ? `rgba(${r},${g},${b},0.35)`
                            : "rgba(255,255,255,0.18)",
                        transition: "color 500ms",
                      }}
                    >
                      {SHORT_LABELS[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── DONE ─────────────────────────────────────────────────────────── */}
      {mode === "done" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          <p className="text-xs tracking-[0.25em] uppercase text-white/55 mb-4 font-mono">
            Session complete
          </p>
          <h2 className="text-2xl md:text-3xl mb-3 font-light">
            You&apos;ve heard all six layers.
          </h2>
          <p className="text-white/75 text-base max-w-sm mb-8 leading-relaxed">
            Your ear has traveled from the room&apos;s deepest foundation to
            the shimmer at the edge of hearing.
          </p>
          <div className="flex gap-3">
            <button
              onClick={resetSession}
              className="px-6 py-3 min-h-[44px] text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Listen again
            </button>
            <Link
              href="/dream"
              className="px-6 py-3 min-h-[44px] text-sm tracking-wider uppercase border border-white/15 text-white/50 rounded hover:border-white/35 hover:text-white/70 transition flex items-center"
            >
              ← Back
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
