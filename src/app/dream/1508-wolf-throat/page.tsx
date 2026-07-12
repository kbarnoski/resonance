"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";
import {
  TUNINGS,
  buildLandscape,
  foldToPeriod,
  harmonicComplex,
  nearestDegree,
  periodPosition,
  roughnessAtPos,
  type Landscape,
  type Tuning,
} from "./tunings";
import { detectPitch } from "./pitch";
import { createThroatAudio, type ThroatAudio } from "./audio";

// ── Constants ────────────────────────────────────────────────────────────────
const BASE_HZ = 146.83; // D3 — a warm, beat-legible drone register
const REF_PARTIALS = 5; // must match audio.ts DRONE_PARTIALS
const VOICE_HOLD_MS = 260; // how long a detected pitch keeps the cursor "live"
const TRAIL_MAX = 52;

// Seeded PRNG (determinism — no Math.random / Date.now anywhere).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Warm→hot dissonance ramp (canvas art only; UI chrome stays violet).
const C_CONSONANT = [255, 209, 138]; // gold
const C_MID = [255, 138, 92]; // ember
const C_ROUGH = [255, 61, 129]; // hot magenta

function roughColor(r: number, alpha: number): string {
  const t = Math.max(0, Math.min(1, r));
  let a: number[];
  let b: number[];
  let f: number;
  if (t < 0.5) {
    a = C_CONSONANT;
    b = C_MID;
    f = t / 0.5;
  } else {
    a = C_MID;
    b = C_ROUGH;
    f = (t - 0.5) / 0.5;
  }
  const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * f);
  return `rgba(${ch(0)},${ch(1)},${ch(2)},${alpha})`;
}

// ── Runtime state carried across frames (kept in a ref, never re-rendered). ──
interface Runtime {
  started: boolean;
  reduced: boolean;
  land: Landscape;
  tuning: Tuning;
  // cursor
  pos: number; // 0..1 across the period
  smoothPos: number;
  rough: number; // roughness at cursor (0..1)
  level: number; // throat loudness 0..1
  live: boolean; // real voice detected recently
  lastVoiceMs: number;
  centsOff: number;
  degIndex: number;
  // phantom auto-singer
  phantomPos: number;
  phantomTarget: number;
  phantomNextMs: number;
  // visuals
  trail: { x: number; y: number; r: number }[];
  bloom: number; // consonance bloom energy
  rng: () => number;
}

export default function WolfThroatPage() {
  const [started, setStarted] = useState(false);
  const [tuningIdx, setTuningIdx] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // Mirror of live readout for the DOM overlay (throttled updates).
  const [readout, setReadout] = useState({
    degIndex: 0,
    centsOff: 0,
    rough: 0,
    live: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<ThroatAudio | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const flicker = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 0.08, floor: 0.82 }),
  );

  const reference = useRef(harmonicComplex(BASE_HZ, REF_PARTIALS));
  const runtimeRef = useRef<Runtime | null>(null);
  const readoutAccumRef = useRef(0);

  // Lazily create the runtime once.
  if (runtimeRef.current === null) {
    const tuning = TUNINGS[0];
    runtimeRef.current = {
      started: false,
      reduced: prefersReducedMotion(),
      land: buildLandscape(tuning, BASE_HZ, reference.current),
      tuning,
      pos: 0.5,
      smoothPos: 0.5,
      rough: 0.5,
      level: 0,
      live: false,
      lastVoiceMs: -9999,
      centsOff: 0,
      degIndex: 0,
      phantomPos: 0.2,
      phantomTarget: 0.5,
      phantomNextMs: 0,
      trail: [],
      bloom: 0,
      rng: mulberry32(0x51fe),
    };
    flicker.current.enable(); // gentle slow luminance breathe (≤3 Hz, soft sine)
  }

  // ── Rebuild landscape when tuning changes. ─────────────────────────────────
  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const tuning = TUNINGS[tuningIdx];
    rt.tuning = tuning;
    rt.land = buildLandscape(tuning, BASE_HZ, reference.current);
    rt.trail = [];
  }, [tuningIdx]);

  // ── Begin: gesture-gated audio + mic. ──────────────────────────────────────
  const handleBegin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    const rt = runtimeRef.current;
    if (rt) rt.started = true;

    // 1. Audio (its own AudioContext, created on this gesture).
    const audio = createThroatAudio(BASE_HZ);
    audioRef.current = audio;
    if (!audio) setAudioError(true);

    // 2. Mic — analysis only, on a dedicated context, never routed to output.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const mctx = new Ctor();
      micCtxRef.current = mctx;
      const source = mctx.createMediaStreamSource(stream);
      const analyser = mctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // NOT connected to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4),
      );
      setMicError(null);
    } catch (e) {
      setMicError(
        e instanceof Error && e.message
          ? "Microphone unavailable — the landscape will dream on its own."
          : "Microphone permission denied — the landscape will dream on its own.",
      );
    }
  }, [started]);

  // ── The one render + analysis loop (runs for the component's whole life). ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(240, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = () => {
      const rt = runtimeRef.current;
      if (!rt) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const nowMs = performance.now();
      const t = nowMs / 1000;

      // ── Pitch analysis ─────────────────────────────────────────────────
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      const mctx = micCtxRef.current;
      let detected: number | null = null;
      let clarity = 0;
      if (analyser && buf && mctx) {
        analyser.getFloatTimeDomainData(
          buf as unknown as Float32Array<ArrayBuffer>,
        );
        const p = detectPitch(buf, mctx.sampleRate, {
          threshold: 0.14,
          rmsGate: 0.01,
        });
        if (p && p.clarity > 0.55) {
          detected = p.hz;
          clarity = p.clarity;
        }
      }

      if (detected !== null) {
        const folded = foldToPeriod(detected, BASE_HZ, rt.tuning.periodRatio);
        rt.pos = periodPosition(folded, BASE_HZ, rt.tuning.periodCents);
        rt.level = 0.35 + 0.6 * clarity;
        rt.live = true;
        rt.lastVoiceMs = nowMs;
        audioRef.current?.sing(folded, rt.level);
      } else {
        rt.live = nowMs - rt.lastVoiceMs < VOICE_HOLD_MS;
        if (!rt.live) {
          // ── Phantom auto-singer: wander the landscape so it is never still.
          if (nowMs > rt.phantomNextMs) {
            const degPos = rt.land.degreePos;
            const pick = degPos[Math.floor(rt.rng() * degPos.length)] ?? 0.5;
            // Land ON a degree most of the time; sometimes drift "wrong".
            const wrong = rt.rng() < 0.35 ? (rt.rng() - 0.5) * 0.12 : 0;
            rt.phantomTarget = Math.max(0.02, Math.min(0.98, pick + wrong));
            rt.phantomNextMs =
              nowMs + (rt.reduced ? 3400 : 1900) + rt.rng() * 1400;
          }
          const ease = rt.reduced ? 0.02 : 0.05;
          rt.phantomPos += (rt.phantomTarget - rt.phantomPos) * ease;
          rt.pos = rt.phantomPos;
          rt.level = rt.started ? 0.42 : 0;
          if (rt.started) {
            const f =
              BASE_HZ * Math.pow(2, (rt.pos * rt.tuning.periodCents) / 1200);
            audioRef.current?.sing(f, rt.level);
          }
        }
      }

      // Smooth the drawn cursor a touch.
      rt.smoothPos += (rt.pos - rt.smoothPos) * 0.4;
      rt.rough = roughnessAtPos(rt.land, rt.smoothPos);
      const nd = nearestDegree(rt.smoothPos, rt.tuning);
      rt.degIndex = nd.index;
      rt.centsOff = nd.centsOff;

      // Consonance bloom energy — rises in the valleys, decays on the ridges.
      const consonance = 1 - rt.rough;
      const wantBloom = rt.live || rt.started ? consonance : consonance * 0.5;
      rt.bloom += (wantBloom - rt.bloom) * 0.08;

      drawScene(ctx2d, {
        rt,
        width,
        height,
        dpr,
        t,
        lum: flicker.current.value(t),
      });

      // Throttle the DOM readout (~12 Hz) so React isn't hammered each frame.
      readoutAccumRef.current += 1;
      if (readoutAccumRef.current >= 5) {
        readoutAccumRef.current = 0;
        setReadout({
          degIndex: rt.degIndex,
          centsOff: rt.centsOff,
          rough: rt.rough,
          live: rt.live,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Full teardown on unmount. ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      void micCtxRef.current?.close();
      micCtxRef.current = null;
      analyserRef.current = null;
      timeBufRef.current = null;
    };
  }, []);

  const tuning = TUNINGS[tuningIdx];
  const consonant = readout.rough < 0.32;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0508]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── Top chrome: title + tuning selector ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            dream · 1508 · wolf throat
          </p>
          <h1 className="mt-1 font-semibold text-xl tracking-tight text-foreground sm:text-2xl">
            The Wolf Throat
          </h1>
          <p className="mt-1 max-w-sm text-base leading-snug text-muted-foreground">
            Pick up a whole xenharmonic scale with your voice — and be
            gloriously <span className="text-violet-300">wrong</span> in it on
            purpose — while the roughness you sing across ripples in real time.
          </p>
        </div>

        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          {TUNINGS.map((tn, i) => (
            <button
              key={tn.id}
              onClick={() => setTuningIdx(i)}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                tuningIdx === i
                  ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                  : "border-border bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {tn.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* ── Splash overlay (before first gesture) ───────────────────────── */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/45 px-6 text-center backdrop-blur-[2px]">
          <div className="max-w-lg">
            <p className="text-base leading-relaxed text-muted-foreground">
              A live sensory-dissonance landscape after Plomp–Levelt &amp;
              Sethares. Valleys are consonance; the glowing ridges are the
              audible wrongness. Sing, and the instrument sings back so you can{" "}
              <span className="text-foreground">hear</span> the choice you see.
            </p>
          </div>
          <button
            onClick={handleBegin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enable mic &amp; sing
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          <p className="max-w-sm font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground/70">
            the landscape is already dreaming below
          </p>
        </div>
      )}

      {/* ── Live readout (after start) ──────────────────────────────────── */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border/40 bg-black/30 px-4 py-3 font-mono text-sm backdrop-blur-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">degree</span>
            <span className="text-lg text-foreground">
              {readout.live ? readout.degIndex : "—"}
            </span>
            <span className="text-muted-foreground">
              {readout.live
                ? `${readout.centsOff >= 0 ? "+" : ""}${readout.centsOff.toFixed(
                    0,
                  )}¢`
                : ""}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">roughness</span>
            <span
              className={consonant ? "text-lg text-violet-200" : "text-lg text-violet-300"}
            >
              {(readout.rough * 100).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">
              {readout.live ? (consonant ? "consonant" : "wrong / rough") : "…"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{tuning.name}</span>
            <button
              onClick={() => setShowNotes(true)}
              className="pointer-events-auto text-muted-foreground transition-colors hover:text-foreground"
            >
              notes ↗
            </button>
          </div>
        </div>
      )}

      {/* ── Sensor-failure notice (graceful degrade) ────────────────────── */}
      {started && micError && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur-sm">
          {micError}
        </div>
      )}
      {audioError && (
        <div className="pointer-events-none absolute left-1/2 top-36 z-10 -translate-x-1/2 rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur-sm">
          Web Audio unavailable — the landscape animates, silently.
        </div>
      )}

      {/* ── Design-notes overlay ────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-xl tracking-tight text-foreground">
              The Wolf Throat — design notes
            </h2>
            <div className="mt-3 space-y-3 text-base leading-relaxed text-muted-foreground">
              <p>
                A direct extension of{" "}
                <span className="text-foreground">1408 · wolf ring</span>, which
                made the historically &ldquo;wrong&rdquo; wolf fifth a landmark
                you could walk into. Here that idea becomes a whole playable
                xenharmonic instrument — a full scale you can be wrong in, played
                by singing.
              </p>
              <p>
                Your voice is tracked with a hand-rolled YIN pitch detector and
                laid over a live <span className="text-foreground">sensory-dissonance
                landscape</span> (Plomp–Levelt / Sethares): valleys are
                consonance against the drone, ridges are roughness. Choose a
                tuning — Bohlen–Pierce (a 3:1 tritave, no octave), 19-EDO, a
                sléndro-flavoured pentatonic, or 5-limit just intonation — and
                the whole terrain re-forms.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Refs: William Sethares, <em className="not-italic text-muted-foreground">Tuning,
                Timbre, Spectrum, Scale</em>; Harry Partch,{" "}
                <em className="not-italic text-muted-foreground">Genesis of a Music</em>;
                Plomp &amp; Levelt (1965). Lineage: 1408 · wolf ring.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1508-wolf-throat"]} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas rendering — the luminous, warm, ecstatic dissonance terrain.
// ─────────────────────────────────────────────────────────────────────────────

interface DrawArgs {
  rt: Runtime;
  width: number;
  height: number;
  dpr: number;
  t: number;
  lum: number;
}

function drawScene(ctx: CanvasRenderingContext2D, args: DrawArgs) {
  const { rt, width, height, dpr, t, lum } = args;
  const land = rt.land;
  const samples = land.samples;
  const n = samples.length;

  ctx.save();
  ctx.scale(dpr, dpr);

  const baseY = height * 0.82;
  const amp = height * 0.5;
  const leftPad = width * 0.06;
  const usableW = width * 0.88;
  const xAt = (u: number) => leftPad + u * usableW;
  const yAt = (r: number) => baseY - r * amp;

  // ── Warm background wash (breathes slowly via SafeFlicker luminance). ──
  const bgWarm = 0.5 + 0.5 * Math.sin(t * 0.11);
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, `rgba(${18 + bgWarm * 10},7,14,1)`);
  bg.addColorStop(0.55, "rgba(12,6,11,1)");
  bg.addColorStop(1, "rgba(6,3,7,1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // A warm ember glow low-centre, pulsing with the consonance bloom.
  const emberR = Math.max(width, height) * (0.5 + rt.bloom * 0.25);
  const ember = ctx.createRadialGradient(
    width * 0.5,
    baseY,
    0,
    width * 0.5,
    baseY,
    emberR,
  );
  const emberA = (0.1 + rt.bloom * 0.16) * lum;
  ember.addColorStop(0, `rgba(255,150,90,${emberA})`);
  ember.addColorStop(0.5, `rgba(190,70,120,${emberA * 0.5})`);
  ember.addColorStop(1, "rgba(120,40,90,0)");
  ctx.fillStyle = ember;
  ctx.fillRect(0, 0, width, height);

  // ── Echo layers behind the main terrain (parallax depth). ──
  const echoes = rt.reduced ? 1 : 3;
  for (let e = echoes; e >= 1; e--) {
    const drift = rt.reduced ? 0 : Math.sin(t * 0.25 + e) * 0.012 * e;
    const scale = 1 - e * 0.05;
    const alpha = 0.06 + 0.03 * (echoes - e);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const r = samples[i] * scale;
      const x = xAt(u);
      const y = yAt(r) + e * 10 + drift * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(xAt(1), baseY + 40);
    ctx.lineTo(xAt(0), baseY + 40);
    ctx.closePath();
    ctx.fillStyle = `rgba(150,60,110,${alpha * lum})`;
    ctx.fill();
  }

  // ── Filled main terrain with a warm vertical gradient. ──
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = xAt(u);
    const y = yAt(samples[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(xAt(1), baseY + 60);
  ctx.lineTo(xAt(0), baseY + 60);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, baseY - amp, 0, baseY + 40);
  fill.addColorStop(0, `rgba(255,90,140,${0.34 * lum})`);
  fill.addColorStop(0.5, `rgba(210,70,120,${0.2 * lum})`);
  fill.addColorStop(1, `rgba(90,30,70,${0.05 * lum})`);
  ctx.fillStyle = fill;
  ctx.fill();

  // ── Glowing terrain stroke, coloured segment-by-segment by roughness. ──
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.shadowBlur = 14;
  for (let i = 1; i < n; i++) {
    const u0 = (i - 1) / (n - 1);
    const u1 = i / (n - 1);
    const rMid = (samples[i - 1] + samples[i]) * 0.5;
    const col = roughColor(rMid, 0.92 * lum);
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.moveTo(xAt(u0), yAt(samples[i - 1]));
    ctx.lineTo(xAt(u1), yAt(samples[i]));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // ── Scale-degree landmarks. ──
  const degPos = land.degreePos;
  for (let d = 0; d < degPos.length; d++) {
    const u = degPos[d];
    const x = xAt(u);
    const rHere = roughnessAtPos(land, u);
    const yTop = yAt(rHere);
    const isNear = rt.live && d === rt.degIndex;
    const pulse = isNear && !rt.reduced ? 0.5 + 0.5 * Math.sin(t * 4) : 1;

    ctx.strokeStyle = isNear
      ? `rgba(196,181,253,${0.85 * lum * pulse})`
      : `rgba(255,220,180,${0.16 * lum})`;
    ctx.lineWidth = isNear ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, yTop);
    ctx.stroke();

    // Base dot.
    ctx.beginPath();
    ctx.arc(x, baseY, isNear ? 4 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = isNear
      ? `rgba(221,214,254,${lum})`
      : `rgba(255,210,160,${0.5 * lum})`;
    ctx.fill();

    // Step label.
    ctx.fillStyle = isNear
      ? `rgba(221,214,254,${0.95 * lum})`
      : `rgba(255,210,170,${0.32 * lum})`;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(d), x, baseY + 16);
  }

  // ── The sung cursor — a glowing orb riding the terrain. ──
  const cx = xAt(rt.smoothPos);
  const cy = yAt(rt.rough);
  const alive = rt.level > 0.02;

  // Trail.
  if (alive) {
    rt.trail.push({ x: cx, y: cy, r: rt.rough });
    if (rt.trail.length > TRAIL_MAX) rt.trail.shift();
  } else if (rt.trail.length > 0) {
    rt.trail.shift();
  }
  ctx.lineWidth = 2;
  for (let i = 1; i < rt.trail.length; i++) {
    const a = rt.trail[i - 1];
    const b = rt.trail[i];
    const fade = (i / rt.trail.length) * 0.5;
    ctx.strokeStyle = roughColor(b.r, fade * lum);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  if (alive) {
    const glowCol = roughColor(rt.rough, 1);
    const size = 6 + rt.level * 8;

    // Consonance bloom rings in the valleys.
    if (rt.bloom > 0.4) {
      const rings = rt.reduced ? 1 : 3;
      for (let k = 0; k < rings; k++) {
        const phase = (t * (rt.reduced ? 0.3 : 0.9) + k / rings) % 1;
        const rr = size + phase * 60 * rt.bloom;
        ctx.strokeStyle = roughColor(
          rt.rough,
          (1 - phase) * 0.4 * rt.bloom * lum,
        );
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Roughness shards when we're on a ridge (audible wrongness, visualised).
    if (rt.rough > 0.5 && !rt.reduced) {
      const shards = 6;
      for (let s = 0; s < shards; s++) {
        const ang = (s / shards) * Math.PI * 2 + t * 2;
        const jit = (rt.rough - 0.5) * 26 * (0.6 + 0.4 * Math.sin(t * 20 + s));
        ctx.strokeStyle = roughColor(rt.rough, 0.5 * lum);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * jit, cy + Math.sin(ang) * jit);
        ctx.stroke();
      }
    }

    // The orb itself.
    const orb = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2.4);
    orb.addColorStop(0, roughColor(rt.rough, lum));
    orb.addColorStop(0.4, roughColor(rt.rough, 0.6 * lum));
    orb.addColorStop(1, roughColor(rt.rough, 0));
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,248,240,${0.95 * lum})`;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // A thin plumb line to the base so the pitch position is legible.
    ctx.strokeStyle = glowCol;
    ctx.globalAlpha = 0.25 * lum;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, baseY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── "dreaming" hint when the phantom is driving. ──
  if (rt.started && !rt.live) {
    ctx.fillStyle = `rgba(196,181,253,${0.5 * lum})`;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("· dreaming — sing to take over", leftPad, height * 0.5);
  }

  ctx.restore();
}
