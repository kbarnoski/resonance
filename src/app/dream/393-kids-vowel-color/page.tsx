"use client";

/**
 * 393-kids-vowel-color — Vowel Mirror
 *
 * A child taps Start and makes long vowel sounds.
 * Real-time formant tracking paints the full screen in a bold hue per vowel.
 * The machine sings the vowel back through formant-filtered just-intonation tones.
 *
 * References:
 *   - Peterson & Barney (1952) — vowel formant centroids
 *   - AURORA formant-biofeedback model (arXiv:2603.17543, March 2026)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  detectVowel,
  resetFormantSmoother,
  VOWEL_PALETTES,
  ATTRACT_SEQUENCE,
  type VowelId,
} from "./formants";
import {
  startAmbientPad,
  startSingback,
  playAttractChime,
  type PadHandle,
  type SingbackHandle,
} from "./synth";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppPhase = "idle" | "running" | "denied";

interface VisState {
  vowel: VowelId;
  rms: number;
  confidence: number;
  active: boolean;
  f1: number;
  f2: number;
}

// ── Color helpers (work in [r,g,b] space to avoid re-parsing) ────────────────

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function rgbToCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Face SVG ──────────────────────────────────────────────────────────────────

function buildFaceSvg(vowel: VowelId, active: boolean, rms: number): string {
  const scale = active ? 1 + Math.min(rms * 2, 0.35) : 1;
  const mouthPaths: Record<VowelId, string> = {
    a: "M 35 65 Q 50 88 65 65",
    e: "M 28 62 Q 50 73 72 62",
    i: "M 34 62 Q 50 71 66 62",
    o: "M 42 60 Q 50 80 58 60",
    u: "M 43 62 Q 50 76 57 62",
  };
  const eyeRy = active ? 8 : 7;
  return [
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"`,
    ` style="transform:scale(${scale.toFixed(3)});transition:transform 0.15s;display:block">`,
    `<circle cx="50" cy="50" r="44" fill="rgba(0,0,0,0.22)"`,
    ` stroke="rgba(255,255,255,0.6)" stroke-width="2.5"/>`,
    `<ellipse cx="34" cy="40" rx="7" ry="${eyeRy}" fill="white"/>`,
    `<ellipse cx="66" cy="40" rx="7" ry="${eyeRy}" fill="white"/>`,
    `<circle cx="34" cy="40" r="4" fill="#111"/>`,
    `<circle cx="66" cy="40" r="4" fill="#111"/>`,
    `<path d="${mouthPaths[vowel]}" stroke="rgba(255,255,255,0.92)"`,
    ` stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    `</svg>`,
  ].join("");
}

// ── Display info (no reading needed — emoji + short phonetic) ─────────────────

const VOWEL_DISPLAY: Record<VowelId, { emoji: string; name: string }> = {
  a: { emoji: "🔴", name: "aaah" },
  e: { emoji: "🟡", name: "eee" },
  i: { emoji: "🟠", name: "iii" },
  o: { emoji: "🔵", name: "ooo" },
  u: { emoji: "🟣", name: "uuu" },
};

// ── Blend state (persists across rAF frames without triggering re-renders) ────

interface BlendState {
  g0: RGB;
  g1: RGB;
  g2: RGB;
  angle: number;
  bright: number;
}

function initialBlend(): BlendState {
  return {
    g0: hexToRgb("#1a0a00"),
    g1: hexToRgb("#0a0520"),
    g2: hexToRgb("#001020"),
    angle: 135,
    bright: 0.5,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VowelColorPage() {
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [visState, setVisState] = useState<VisState>({
    vowel: "a",
    rms: 0,
    confidence: 0,
    active: false,
    f1: 500,
    f2: 1500,
  });
  const [micError, setMicError] = useState<string | null>(null);
  const [bgStyle, setBgStyle] = useState<React.CSSProperties>({
    background: "linear-gradient(135deg,#1a0a00 0%,#0a0520 50%,#001020 100%)",
  });
  const [glowStyle, setGlowStyle] = useState<React.CSSProperties>({});
  const [faceSvg, setFaceSvg] = useState<string>(() =>
    buildFaceSvg("a", false, 0)
  );

  // Audio graph refs
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const padRef = useRef<PadHandle | null>(null);
  const singbackRef = useRef<SingbackHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const attractRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blendRef = useRef<BlendState>(initialBlend());

  // ── Attract mode (mic denied / no mic) ────────────────────────────────────

  const runAttractMode = useCallback((actx: AudioContext) => {
    let idx = 0;
    const tick = () => {
      const vowel = ATTRACT_SEQUENCE[idx % ATTRACT_SEQUENCE.length];
      const pal = VOWEL_PALETTES[vowel];
      const angle = 135 + idx * 72;
      blendRef.current.g0 = hexToRgb(pal.grad[0]);
      blendRef.current.g1 = hexToRgb(pal.grad[1]);
      blendRef.current.g2 = hexToRgb(pal.grad[2]);
      blendRef.current.angle = angle;
      blendRef.current.bright = 0.7;
      setBgStyle({
        background: `linear-gradient(${angle}deg,${pal.grad[0]} 0%,${pal.grad[1]} 50%,${pal.grad[2]} 100%)`,
        transition: "background 1.2s ease",
      });
      setFaceSvg(buildFaceSvg(vowel, true, 0.06));
      setVisState({
        vowel,
        rms: 0.06,
        confidence: 0.85,
        active: true,
        f1: 500,
        f2: 1500,
      });
      playAttractChime(actx, idx);
      singbackRef.current?.setVowel(vowel);
      singbackRef.current?.setAmplitude(0.07);
      idx++;
    };
    tick();
    attractRef.current = setInterval(tick, 2500);
  }, []);

  // ── rAF animation loop ────────────────────────────────────────────────────

  const runLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const freqBuf = freqBufRef.current;
    const timeBuf = timeBufRef.current;
    const actx = actxRef.current;
    if (!analyser || !freqBuf || !timeBuf || !actx) return;

    analyser.getFloatFrequencyData(freqBuf);
    analyser.getFloatTimeDomainData(timeBuf);

    const result = detectVowel(freqBuf, timeBuf, actx.sampleRate, analyser.fftSize);

    // Drive singback
    if (result.active) {
      singbackRef.current?.setVowel(result.vowel, result.f1, result.f2);
      singbackRef.current?.setAmplitude(result.rms);
    } else {
      singbackRef.current?.setAmplitude(0);
    }

    // Blend colors toward current vowel palette
    const pal = VOWEL_PALETTES[result.vowel];
    const b = blendRef.current;
    const alpha = result.active ? 0.07 : 0.015;

    b.g0 = lerpRgb(b.g0, hexToRgb(pal.grad[0]), alpha);
    b.g1 = lerpRgb(b.g1, hexToRgb(pal.grad[1]), alpha);
    b.g2 = lerpRgb(b.g2, hexToRgb(pal.grad[2]), alpha);

    const brightTarget = result.active
      ? 0.5 + Math.min(result.rms * 3.5, 0.5)
      : 0.48;
    b.bright = lerpNum(b.bright, brightTarget, 0.08);
    b.angle = lerpNum(b.angle, 135, 0.02);

    const brightMult = (0.55 + b.bright * 0.85).toFixed(2);
    setBgStyle({
      background: `linear-gradient(${b.angle.toFixed(1)}deg,${rgbToCss(b.g0)} 0%,${rgbToCss(b.g1)} 50%,${rgbToCss(b.g2)} 100%)`,
      filter: `brightness(${brightMult})`,
    });

    const glowPx = result.active ? 100 + result.rms * 500 : 40;
    setGlowStyle({
      boxShadow: `0 0 ${glowPx.toFixed(0)}px ${(glowPx * 0.55).toFixed(0)}px ${pal.glow}`,
      transition: "box-shadow 0.1s ease",
    });

    setFaceSvg(buildFaceSvg(result.vowel, result.active, result.rms));

    setVisState({
      vowel: result.vowel,
      rms: result.rms,
      confidence: result.confidence,
      active: result.active,
      f1: result.f1,
      f2: result.f2,
    });

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    // AudioContext + getUserMedia must be created inside a user-gesture handler
    const actx = new AudioContext({ sampleRate: 44100 });
    actxRef.current = actx;
    if (actx.state === "suspended") await actx.resume();

    // Ambient pad starts immediately so there is always sound
    padRef.current = startAmbientPad(actx);
    singbackRef.current = startSingback(actx);
    resetFormantSmoother();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;
    } catch {
      setMicError(
        "Microphone not available — showing a demo. Tap Start to try again!"
      );
      setPhase("denied");
      runAttractMode(actx);
      return;
    }

    setPhase("running");

    const source = actx.createMediaStreamSource(stream);
    const analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyserRef.current = analyser;

    freqBufRef.current = new Float32Array(analyser.frequencyBinCount);
    timeBufRef.current = new Float32Array(analyser.fftSize);

    rafRef.current = requestAnimationFrame(runLoop);
  }, [runAttractMode, runLoop]);

  // ── Stop / cleanup ────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (attractRef.current !== null) clearInterval(attractRef.current);
    padRef.current?.stop();
    singbackRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    actxRef.current?.close();
    actxRef.current = null;
    analyserRef.current = null;
    freqBufRef.current = null;
    timeBufRef.current = null;
    padRef.current = null;
    singbackRef.current = null;
    streamRef.current = null;
    rafRef.current = null;
    attractRef.current = null;
    blendRef.current = initialBlend();
    setPhase("idle");
    setMicError(null);
    setVisState({ vowel: "a", rms: 0, confidence: 0, active: false, f1: 500, f2: 1500 });
    setBgStyle({
      background: "linear-gradient(135deg,#1a0a00 0%,#0a0520 50%,#001020 100%)",
    });
    setGlowStyle({});
    setFaceSvg(buildFaceSvg("a", false, 0));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (attractRef.current !== null) clearInterval(attractRef.current);
      padRef.current?.stop();
      singbackRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      actxRef.current?.close();
    };
  }, []);

  // ── Derived render values ─────────────────────────────────────────────────

  const isActive = phase !== "idle";
  const pal = VOWEL_PALETTES[visState.vowel];
  const display = VOWEL_DISPLAY[visState.vowel];
  const confPct = Math.round(visState.confidence * 100);
  const volPct = Math.min(100, Math.round(visState.rms * 500));

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      {/* ── Full-screen CSS color field (the main visual) ── */}
      <div
        className="fixed inset-0"
        style={bgStyle}
        aria-hidden="true"
      />

      {/* ── Glow orb ── */}
      {isActive && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none"
          style={glowStyle}
          aria-hidden="true"
        />
      )}

      {/* ── Content layer ── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ════════════════════════════════════════
            IDLE / START SCREEN
        ════════════════════════════════════════ */}
        {phase === "idle" && (
          <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center gap-8">

            <h1 className="text-4xl font-bold tracking-tight text-foreground drop-shadow-lg">
              Vowel Mirror
            </h1>

            <p className="text-foreground text-lg max-w-xs leading-relaxed">
              Make a sound and paint the whole screen!
            </p>

            {/* Vowel color guide — visual key, no reading needed */}
            <div className="flex gap-3 flex-wrap justify-center">
              {(["a", "e", "i", "o", "u"] as VowelId[]).map((v) => {
                const p = VOWEL_PALETTES[v];
                const d = VOWEL_DISPLAY[v];
                return (
                  <div
                    key={v}
                    className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl min-w-[56px]"
                    style={{
                      background: `linear-gradient(150deg,${p.grad[0]},${p.grad[1]})`,
                    }}
                  >
                    <span className="text-2xl" aria-hidden="true">{d.emoji}</span>
                    <span className="text-foreground font-bold text-sm">{d.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Start button — big enough for small fingers */}
            <button
              onClick={handleStart}
              className="flex items-center justify-center w-44 rounded-3xl text-foreground font-bold text-2xl shadow-2xl active:scale-95 transition-transform"
              style={{
                background: "linear-gradient(135deg,#c0392b,#f39c12)",
                height: 80,
                minHeight: 64,
              }}
            >
              Start
            </button>

            <Link
              href="/dream/393-kids-vowel-color/README.md"
              className="text-muted-foreground text-xs font-mono hover:text-foreground transition-colors"
            >
              Read the design notes
            </Link>
          </div>
        )}

        {/* ════════════════════════════════════════
            RUNNING / ATTRACT (DENIED) SCREEN
        ════════════════════════════════════════ */}
        {phase !== "idle" && (
          <div className="relative flex flex-col items-center justify-center flex-1 px-4 py-6 gap-5 text-center">

            {/* Mic error banner */}
            {micError && (
              <div className="bg-black/50 rounded-2xl px-5 py-3 max-w-sm">
                <p className="text-violet-300 text-base leading-relaxed">{micError}</p>
              </div>
            )}

            {/* Reactive face (inline SVG via dangerouslySetInnerHTML — just the face, not the main viz) */}
            <div
              className="w-44 h-44 flex-shrink-0 drop-shadow-2xl"
              dangerouslySetInnerHTML={{ __html: faceSvg }}
              aria-label={`Face showing vowel ${display.name}`}
            />

            {/* Vowel label */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-6xl" role="img" aria-label={display.name}>
                {display.emoji}
              </span>
              <span
                className="text-5xl font-bold text-foreground drop-shadow-lg tracking-wide"
                style={{ textShadow: `0 0 28px ${pal.glow}` }}
              >
                {display.name}
              </span>

              {visState.active && (
                <span className="text-muted-foreground text-sm font-mono">
                  F1&nbsp;{Math.round(visState.f1)}&nbsp;Hz&nbsp;&nbsp;
                  F2&nbsp;{Math.round(visState.f2)}&nbsp;Hz&nbsp;&nbsp;
                  {confPct}%
                </span>
              )}

              {!visState.active && phase === "running" && (
                <span className="text-muted-foreground text-lg animate-pulse">
                  Make a sound&hellip;
                </span>
              )}
            </div>

            {/* Volume bar */}
            {phase === "running" && (
              <div
                className="w-56 h-4 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={volPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Volume level"
              >
                <div
                  className="h-full rounded-full transition-all duration-75"
                  style={{ width: `${volPct}%`, background: pal.glow }}
                />
              </div>
            )}

            {/* Stop button */}
            <button
              onClick={handleStop}
              className="mt-2 px-6 py-3 rounded-2xl bg-black/35 text-foreground text-base font-mono border border-border hover:bg-black/55 active:scale-95 transition-all"
              style={{ minHeight: 44 }}
            >
              Stop
            </button>

            {/* Corner link */}
            <Link
              href="/dream/393-kids-vowel-color/README.md"
              className="absolute bottom-4 right-4 text-muted-foreground text-xs font-mono hover:text-foreground transition-colors"
            >
              design notes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
