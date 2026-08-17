"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14704 · Choir Glass — hum a harmony into a stained-glass rose window of your
// own catalog, and the takes that consonate with your voice light up and swell.
//
//   "What if I could HUM a harmony, and the moments in my whole catalog that
//    consonate with it lit up and swelled — a stained-glass rose window of my
//    own recordings, tuned live to my voice?"
//
//   Sixteen of Karel's real piano takes are the sixteen panes of a Gothic rose
//   window. A SEPARATE mic AnalyserNode reads the pitch class you hum (control
//   only — never routed to a speaker; you never hear your own mic). Each pane
//   tracks its own live harmony from `loadTrackAnalysis` (the chord under the
//   playhead → root/third/fifth). Panes whose chord CONSONATES with your sung
//   note swell in whole-take gain and glow; dissonant panes recede to dark
//   glass. Sustain a note and the lit panes become a chord of his real takes —
//   the glass IS the choir. All catalog audio goes through one createSafeMaster;
//   visuals ride safe.analyser. No mic → an autonomous demo walks a sung note
//   around the circle so the window sings on its own (keys = pitch classes too).
//
//   REFS  medieval rose-window / Gothic light as the visual metaphor; Pauline
//   Oliveros, *Deep Listening* (harmonic / whole-body listening); arXiv:2608.04378
//   (co-creation agents that "listen" via hierarchical world models, Aug 2026) —
//   this is a co-creation instrument that listens to your voice and answers
//   harmonically with the artist's own recordings.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { mulberry32 } from "../_shared/erosion/engine";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  PANE_COUNT,
  detectSungPitch,
  pitchClassName,
  paneConsonance,
  chordTones,
  buildPetals,
  paneHue,
  glassFill,
  leadStroke,
  VIEW,
  CENTER,
  INNER_R,
  OUTER_R,
} from "./choir";

// per-pane audible ceiling (safeMaster limits the sum on top of this)
const PANE_GAIN_CEIL = 0.5;
// visual/audio "lit" cutoff
const LIT_LEVEL = 0.12;
// keyboard fallback: tracker-style piano row → pitch class
const KEY_TO_PC: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 0,
};

interface Pane {
  id: string;
  title: string;
  hue: number;
  gainNode: GainNode | null;
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  startAt: number | null; // ctx time the loop started
  duration: number;
  chords: TrackChord[];
  basePc: number;
  chordIdx: number;
  level: number; // smoothed 0..1
  consonance: number; // last computed 0..1
}

type Mode = "idle" | "mic" | "demo";

export default function ChoirGlassPage() {
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const petals = useMemo(() => buildPetals(), []);

  // ── audio + engine refs ──────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const panesRef = useRef<Pane[]>([]);
  const rafRef = useRef<number | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micBufRef = useRef<Float32Array | null>(null);
  const masterBufRef = useRef<Float32Array | null>(null);

  const sungRef = useRef<{ pc: number; clarity: number }>({ pc: 0, clarity: 0 });
  const pulseRef = useRef(0);
  const modeRef = useRef<Mode>("idle");
  const demoRef = useRef<{ pc: number; holdUntil: number; rng: () => number }>({
    pc: 0,
    holdUntil: 0,
    rng: mulberry32(0x9e37 ^ 14704),
  });
  // keyboard override: ordered stack of held keys
  const keyStackRef = useRef<string[]>([]);

  // ── per-pane active chord tones from the live playhead ─────────────────────
  const paneTones = useCallback((pane: Pane, ctxTime: number): number[] => {
    const chords = pane.chords;
    if (chords.length === 0) return chordTones(pane.basePc, false);

    // Playhead position: real playback clock if the loop is running, else a
    // slow wall-clock walk so the glass still animates before audio arrives.
    let t: number;
    if (pane.source && pane.startAt !== null && pane.duration > 0) {
      t = (ctxTime - pane.startAt) % pane.duration;
    } else {
      const span = chords[chords.length - 1].time + chords[chords.length - 1].duration;
      t = span > 0 ? (performance.now() / 1000) % span : 0;
    }

    // advance the cached chord index toward t (chords are time-sorted)
    let idx = pane.chordIdx;
    if (t < chords[idx].time) idx = 0;
    while (idx + 1 < chords.length && chords[idx + 1].time <= t) idx++;
    pane.chordIdx = idx;

    const sym = chords[idx].chord;
    const root = chordRoot(sym);
    if (root === null) return chordTones(pane.basePc, false);
    return chordTones(root, chordIsMinor(sym));
  }, []);

  // ── the frame loop: read the voice, drive gains + glow ─────────────────────
  const runFrame = useCallback(() => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe) return;
    const ctxTime = ctx.currentTime;
    const now = performance.now();

    // 1) resolve the sung pitch class this frame -----------------------------
    const stack = keyStackRef.current;
    if (stack.length > 0) {
      // keyboard override wins (works in any mode)
      sungRef.current = { pc: KEY_TO_PC[stack[stack.length - 1]], clarity: 1 };
    } else if (modeRef.current === "mic") {
      const an = micAnalyserRef.current;
      const buf = micBufRef.current;
      if (an && buf) {
        an.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
        const found = detectSungPitch(buf, ctx.sampleRate);
        if (found && found.clarity > 0.12) {
          sungRef.current = { pc: found.pc, clarity: found.clarity };
        } else {
          // hold the last note but let it fade so panes settle smoothly
          sungRef.current = {
            pc: sungRef.current.pc,
            clarity: sungRef.current.clarity * 0.9,
          };
        }
      }
    } else if (modeRef.current === "demo") {
      const demo = demoRef.current;
      if (now >= demo.holdUntil) {
        const steps = [7, 5, 4, 3, -5, -7];
        const step = steps[Math.floor(demo.rng() * steps.length)];
        demo.pc = ((demo.pc + step) % 12 + 12) % 12;
        demo.holdUntil = now + 900 + demo.rng() * 1000;
      }
      sungRef.current = { pc: demo.pc, clarity: 0.9 };
    }

    const sung = sungRef.current;

    // 2) per-pane consonance → target level → smoothed swell → gain ----------
    let maxLevel = 0;
    for (const pane of panesRef.current) {
      const tones = paneTones(pane, ctxTime);
      const cons = paneConsonance(sung.pc, tones);
      pane.consonance = cons;
      // gate: only genuinely consonant panes light; scaled by how clearly
      // the voice is present this frame
      const gated = cons > 0.5 ? (cons - 0.5) / 0.5 : 0;
      const target = gated * sung.clarity;
      // swell in faster than it recedes — takes bloom, then linger
      const k = target > pane.level ? 0.12 : 0.055;
      pane.level += (target - pane.level) * k;
      if (pane.gainNode) {
        pane.gainNode.gain.setTargetAtTime(
          pane.level * PANE_GAIN_CEIL,
          ctxTime,
          0.08,
        );
      }
      if (pane.level > maxLevel) maxLevel = pane.level;
    }

    // 3) global pulse from the tamed master (for the SVG glow) ----------------
    const mbuf = masterBufRef.current;
    if (mbuf) {
      safe.analyser.getFloatTimeDomainData(
        mbuf as unknown as Float32Array<ArrayBuffer>,
      );
      let rms = 0;
      for (let i = 0; i < mbuf.length; i++) rms += mbuf[i] * mbuf[i];
      rms = Math.sqrt(rms / mbuf.length);
      pulseRef.current = pulseRef.current * 0.8 + Math.min(1, rms * 6) * 0.2;
    }

    // 4) hand a fresh snapshot to React, then queue the next frame -----------
    setTick((n) => (n + 1) % 1_000_000);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [paneTones]);

  // ── lazy loader: analysis first (fast, drives visuals), then buffer --------
  const loadPane = useCallback(async (pane: Pane) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe) return;
    try {
      const analysis = await loadTrackAnalysis(pane.id);
      if (analysis) {
        pane.chords = analysis.chords ?? [];
        if (pane.chords.length > 0) {
          const r = chordRoot(pane.chords[0].chord);
          if (r !== null) pane.basePc = r;
        } else if (analysis.key_signature) {
          const r = chordRoot(analysis.key_signature);
          if (r !== null) pane.basePc = r;
        }
      }
    } catch {
      /* keep fallback basePc / empty chords */
    }
    if (ctxRef.current !== ctx) return; // torn down mid-load
    try {
      const { buffer } = await loadRealTrackBuffer(ctx, pane.id);
      if (ctxRef.current !== ctx) return;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.0001;
      gainNode.connect(safe.input);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gainNode);
      source.start(0);
      pane.buffer = buffer;
      pane.gainNode = gainNode;
      pane.source = source;
      pane.startAt = ctx.currentTime;
      pane.duration = buffer.duration;
    } catch {
      /* pane stays silent but still lights visually */
    }
  }, []);

  // ── start (needs a user gesture) ───────────────────────────────────────────
  const start = useCallback(async () => {
    if (started || starting) return;
    setStarting(true);
    setMicError(null);
    setFatal(null);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      ctxRef.current = ctx;
      safeRef.current = safe;
      masterBufRef.current = new Float32Array(
        new ArrayBuffer(safe.analyser.fftSize * 4),
      );

      // build the 16 panes (one per real take)
      const tracks = REAL_TRACKS.slice(0, PANE_COUNT);
      panesRef.current = tracks.map((t, i) => ({
        id: t.id,
        title: t.title,
        hue: paneHue(i),
        gainNode: null,
        source: null,
        buffer: null,
        startAt: null,
        duration: 0,
        chords: [],
        basePc: (i * 7) % 12, // spread around the circle of fifths as fallback
        chordIdx: 0,
        level: 0,
        consonance: 0,
      }));

      // try the mic (CONTROL ONLY — never connected onward to any output)
      let micOk = false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        micStreamRef.current = stream;
        const micSource = ctx.createMediaStreamSource(stream);
        const micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 2048;
        micAnalyser.smoothingTimeConstant = 0.15;
        micSource.connect(micAnalyser); // sink tap; NOT connected to output
        micAnalyserRef.current = micAnalyser;
        micBufRef.current = new Float32Array(
          new ArrayBuffer(micAnalyser.fftSize * 4),
        );
        micOk = true;
      } catch (e) {
        setMicError(
          e instanceof Error
            ? `Mic unavailable (${e.message}). Running the autonomous demo — or use the keyboard (A–J = notes).`
            : "Mic unavailable. Running the autonomous demo — or use the keyboard (A–J = notes).",
        );
      }

      modeRef.current = micOk ? "mic" : "demo";
      setMode(micOk ? "mic" : "demo");
      demoRef.current.holdUntil = 0;

      // fire lazy loads (do NOT await — keeps first paint under ~1s)
      for (const pane of panesRef.current) void loadPane(pane);

      setStarted(true);
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setFatal(
        e instanceof Error ? e.message : "Could not start the audio engine.",
      );
    } finally {
      setStarting(false);
    }
  }, [started, starting, loadPane, runFrame]);

  // ── teardown ───────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    for (const pane of panesRef.current) {
      try {
        pane.source?.stop();
        pane.source?.disconnect();
        pane.gainNode?.disconnect();
      } catch {
        /* noop */
      }
    }
    panesRef.current = [];
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    try {
      safeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    safeRef.current = null;
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") void ctx.close();
    ctxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStarted(false);
    setMode("idle");
    sungRef.current = { pc: 0, clarity: 0 };
    setTick((n) => n + 1);
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  // ── keyboard fallback: hold a key to sing that pitch class ─────────────────
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_TO_PC) || e.repeat) return;
      e.preventDefault();
      if (!keyStackRef.current.includes(k)) keyStackRef.current.push(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_TO_PC)) return;
      keyStackRef.current = keyStackRef.current.filter((x) => x !== k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keyStackRef.current = [];
    };
  }, [started]);

  // ── render snapshot (refs read here; setTick drives re-render) ─────────────
  const panes = panesRef.current;
  const sung = sungRef.current;
  const pulse = pulseRef.current;
  const usingKeys = keyStackRef.current.length > 0;
  const voiceActive = sung.clarity > 0.12 || usingKeys;
  const litCount = panes.filter((p) => p.level > LIT_LEVEL).length;
  const glow = 2 + pulse * 7 + (panes.reduce((m, p) => Math.max(m, p.level), 0) * 4);
  const sungAngleDeg = -90 + (sung.pc / 12) * 360;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-7">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            14704 · Choir Glass
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hum a harmony into the glass
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            A rose window of sixteen of Karel&apos;s real piano takes. Hum a note
            and the takes whose harmony consonates with your voice light up and
            swell — sustain it, and the lit panes become a chord of his own
            recordings. Your voice only steers the glass; you never hear the mic.
          </p>
        </header>

        {/* ── controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {starting ? "Opening the window…" : "Hum into the glass"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close the window
            </button>
          )}

          {started && (
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="rounded-md border border-border px-2 py-1">
                {usingKeys ? "keys" : mode === "mic" ? "listening" : "auto demo"}
              </span>
              <span className="rounded-md border border-border px-2 py-1">
                sung {voiceActive ? pitchClassName(sung.pc) : "—"}
              </span>
              <span className="rounded-md border border-border px-2 py-1">
                {litCount} / {PANE_COUNT} lit
              </span>
            </div>
          )}
        </div>

        {micError && (
          <p className="text-base text-destructive" role="status">
            {micError}
          </p>
        )}
        {fatal && (
          <p className="text-base text-destructive" role="alert">
            The glass could not render: {fatal}
          </p>
        )}

        {/* ── the rose window ── */}
        <div className="rounded-lg border border-border bg-[#07070b] p-3">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="mx-auto aspect-square w-full max-w-[560px]"
            role="img"
            aria-label={`Stained-glass rose window of ${PANE_COUNT} recordings; ${litCount} panes lit by the sung note ${voiceActive ? pitchClassName(sung.pc) : "none"}`}
          >
            <defs>
              <radialGradient id="cg-bg" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="#12121a" />
                <stop offset="100%" stopColor="#050507" />
              </radialGradient>
              <filter id="cg-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={glow.toFixed(2)} result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width={VIEW} height={VIEW} fill="url(#cg-bg)" />

            {/* outer tracery rings */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={OUTER_R + 14}
              fill="none"
              stroke="#1c1c26"
              strokeWidth={6}
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={INNER_R - 4}
              fill="none"
              stroke="#1c1c26"
              strokeWidth={4}
            />

            {/* the sixteen panes */}
            {petals.map((petal, i) => {
              const pane = panes[i];
              const level = pane?.level ?? 0;
              const hue = paneHue(i);
              const lit = level > LIT_LEVEL;
              return (
                <g key={i} filter={lit ? "url(#cg-glow)" : undefined}>
                  <path
                    d={petal.d}
                    fill={glassFill(hue, level)}
                    stroke={leadStroke(hue)}
                    strokeWidth={4}
                    strokeLinejoin="round"
                  />
                  {/* jewel eye brightens with the swell */}
                  <circle
                    cx={petal.eye.x}
                    cy={petal.eye.y}
                    r={petal.eye.r}
                    fill={`hsl(${hue} 90% ${(55 + level * 35).toFixed(0)}%)`}
                    opacity={(0.15 + level * 0.85).toFixed(2)}
                    stroke={leadStroke(hue)}
                    strokeWidth={2}
                  />
                </g>
              );
            })}

            {/* central rosette — pulses with the whole mix */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={INNER_R - 12}
              fill="#0b0b12"
              stroke="#23232f"
              strokeWidth={3}
            />
            {Array.from({ length: 8 }).map((_, k) => {
              const a = (k / 8) * Math.PI * 2;
              const r = (INNER_R - 12) * 0.55;
              return (
                <circle
                  key={k}
                  cx={CENTER + r * Math.cos(a)}
                  cy={CENTER + r * Math.sin(a)}
                  r={7 + pulse * 5}
                  fill={`hsl(${paneHue(k * 2)} 70% ${(30 + pulse * 40).toFixed(0)}%)`}
                  opacity={0.5 + pulse * 0.4}
                />
              );
            })}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={9 + pulse * 6}
              fill={`hsl(45 90% ${(60 + pulse * 30).toFixed(0)}%)`}
              opacity={0.4 + pulse * 0.5}
            />

            {/* chromatic ring: 12 ticks, the sung note glowing */}
            {Array.from({ length: 12 }).map((_, pc) => {
              const a = (-90 + (pc / 12) * 360) * (Math.PI / 180);
              const r = OUTER_R + 30;
              const on = voiceActive && pc === sung.pc;
              return (
                <circle
                  key={pc}
                  cx={CENTER + r * Math.cos(a)}
                  cy={CENTER + r * Math.sin(a)}
                  r={on ? 8 : 4}
                  fill={on ? `hsl(${paneHue(pc)} 90% 65%)` : "#2a2a36"}
                />
              );
            })}
            {voiceActive && (
              <g
                transform={`rotate(${sungAngleDeg} ${CENTER} ${CENTER})`}
                opacity={Math.max(0.35, sung.clarity).toFixed(2)}
              >
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={CENTER + OUTER_R + 18}
                  y2={CENTER}
                  stroke={`hsl(${paneHue(sung.pc)} 85% 60%)`}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </g>
            )}
          </svg>
        </div>

        {/* ── legend: which take is which pane, lit state ── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          {(started ? panes : REAL_TRACKS.slice(0, PANE_COUNT)).map((t, i) => {
            const level = started ? panes[i]?.level ?? 0 : 0;
            const lit = level > LIT_LEVEL;
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: `hsl(${paneHue(i)} 80% ${lit ? 60 : 22}%)`,
                    boxShadow: lit
                      ? `0 0 8px hsl(${paneHue(i)} 90% 55%)`
                      : "none",
                  }}
                />
                <span
                  className={
                    lit ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {t.title}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground">
          Tip: sustain one note to build a chord of lit takes, then slide a
          semitone to watch panes hand off. With no mic, hold keyboard keys{" "}
          <span className="font-mono text-xs">A W S E D F T G Y H U J</span> as
          the twelve pitch classes.
        </p>

        <details className="border-t border-border pt-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            Read the design notes
          </summary>
          <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              A separate microphone AnalyserNode extracts the pitch class you
              hum by autocorrelation. That signal is control only — it is never
              connected to the catalog audio graph, to createSafeMaster, or to
              the speakers, so you never hear your own voice through the app.
            </p>
            <p>
              Each pane loops one of Karel&apos;s real takes. Its live harmony
              comes from loadTrackAnalysis — the chord under the playhead gives a
              root, third, and fifth. A pane&apos;s swell is the best consonance
              between your sung note and those chord tones: unisons, fifths,
              fourths, thirds, and sixths ring; seconds, sevenths, and the
              tritone recede. Every audible sound is one of the sixteen verified
              recordings, routed through a single createSafeMaster.
            </p>
            <p>
              Metaphor: a medieval rose window / Gothic light. Lineage: Pauline
              Oliveros&apos; Deep Listening. Research tie: arXiv:2608.04378
              (co-creation agents that listen via hierarchical world models,
              Aug 2026).
            </p>
            <Link
              href="/dream"
              className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              ← back to the dream lab
            </Link>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["14704-choirglass"]} />
    </main>
  );
}
