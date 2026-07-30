"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VIOLET } from "@/app/dream/_shared/palette";
import {
  centsOf,
  deriveScale,
  foldToOctave,
  makeSyntheticSpectrum,
  pickPeaks,
  type Degree,
  type Peak,
} from "./biotuner";

// ── Playable keyboard row ────────────────────────────────────────────────────
const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k", "l"] as const;

// Additive voice: fundamental + a few decaying harmonics.
const HARMONICS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 0.5],
  [3, 0.28],
  [4, 0.15],
  [5, 0.08],
];

interface Voice {
  g: GainNode;
  oscs: OscillatorNode[];
  degIdx: number;
}

function triggerVoice(
  ctx: AudioContext,
  master: GainNode,
  freq: number,
  vel: number,
): { g: GainNode; oscs: OscillatorNode[] } {
  const now = ctx.currentTime;
  const g = ctx.createGain();
  // Soft ADSR (no quantiser, continuous pitch).
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.22 * vel), now + 0.02);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.13 * vel), now + 0.18);
  g.connect(master);
  const oscs: OscillatorNode[] = [];
  for (const [h, a] of HARMONICS) {
    const f = freq * h;
    if (f > 16000) continue;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, now);
    const og = ctx.createGain();
    og.gain.value = a;
    osc.connect(og);
    og.connect(g);
    osc.start(now);
    osc.stop(now + 8); // safety horizon
    oscs.push(osc);
  }
  return { g, oscs };
}

function releaseVoice(ctx: AudioContext, v: { g: GainNode; oscs: OscillatorNode[] }) {
  const now = ctx.currentTime;
  try {
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0.0001, now, 0.25);
    v.oscs.forEach((o) => o.stop(now + 1.2));
  } catch {
    /* already stopped */
  }
}

interface FrameData {
  f0: number;
  degrees: Degree[];
  peaks: { cents: number; mag: number }[];
  active: number[];
}

type WinWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export default function OvertoneLoomPage() {
  // ── UI state ───────────────────────────────────────────────────────────────
  const [ready, setReady] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [autopilot, setAutopilot] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [frameData, setFrameData] = useState<FrameData>({
    f0: 0,
    degrees: [],
    peaks: [],
    active: [],
  });

  // ── Audio refs ───────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBufRef = useRef<Float32Array | null>(null);
  const smoothedBufRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const voicesRef = useRef<Map<string, Voice>>(new Map());
  const autoVoiceRef = useRef<{ g: GainNode; oscs: OscillatorNode[] } | null>(null);
  const activeRef = useRef<Set<number>>(new Set());

  // ── Derivation / loop refs ───────────────────────────────────────────────────
  const sourceRef = useRef<"synthetic" | "mic">("synthetic");
  const syntheticRef = useRef<((t: number) => Peak[]) | null>(null);
  const scaleRef = useRef<{ f0: number; degrees: Degree[] }>({ f0: 0, degrees: [] });
  const autopilotRef = useRef(true);
  const demoNextRef = useRef(0);
  const demoIdxRef = useRef(0);
  const lastEmitRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef<() => void>(() => {});

  const resumeAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  }, []);

  const refreshActive = useCallback(() => {
    const s = new Set<number>();
    voicesRef.current.forEach((v) => s.add(v.degIdx));
    activeRef.current = s;
  }, []);

  // ── Play / stop a derived degree ─────────────────────────────────────────────
  const playDegree = useCallback(
    (id: string, degIdx: number, octave: number, vel: number) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master) return;
      resumeAudio();
      const { f0, degrees } = scaleRef.current;
      const deg = degrees[degIdx];
      if (!f0 || !deg) return;
      const freq = f0 * deg.ratio * Math.pow(2, octave);
      const existing = voicesRef.current.get(id);
      if (existing) releaseVoice(ctx, existing);
      const v = triggerVoice(ctx, master, freq, vel);
      voicesRef.current.set(id, { ...v, degIdx });
      refreshActive();
    },
    [resumeAudio, refreshActive],
  );

  const stopDegree = useCallback(
    (id: string) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const v = voicesRef.current.get(id);
      if (!v) return;
      releaseVoice(ctx, v);
      voicesRef.current.delete(id);
      refreshActive();
    },
    [refreshActive],
  );

  // ── Handover: first real input silences the autopilot ─────────────────────────
  const handover = useCallback(() => {
    if (!autopilotRef.current) return;
    autopilotRef.current = false;
    setAutopilot(false);
    const ctx = ctxRef.current;
    if (ctx && autoVoiceRef.current) releaseVoice(ctx, autoVoiceRef.current);
    autoVoiceRef.current = null;
    activeRef.current = new Set();
  }, []);

  // ── Autopilot: arpeggiate the derived degrees across two octaves ─────────────
  const runAutopilotStep = useCallback((now: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const { f0, degrees } = scaleRef.current;
    if (!f0 || degrees.length === 0) return;
    if (autoVoiceRef.current) releaseVoice(ctx, autoVoiceRef.current);
    const total = degrees.length * 2;
    const i = demoIdxRef.current % total;
    demoIdxRef.current += 1;
    const octave = Math.floor(i / degrees.length);
    const degIdx = i % degrees.length;
    const freq = f0 * degrees[degIdx].ratio * Math.pow(2, octave);
    autoVoiceRef.current = triggerVoice(ctx, master, freq, 0.55);
    activeRef.current = new Set([degIdx]);
  }, []);

  // ── Read mic peaks (FFT → smoothed spectrum → peak-pick) ─────────────────────
  const readMicPeaks = useCallback((): Peak[] => {
    const an = analyserRef.current;
    const ctx = ctxRef.current;
    const buf = freqBufRef.current;
    const sm = smoothedBufRef.current;
    if (!an || !ctx || !buf || !sm) return [];
    an.getFloatFrequencyData(buf as unknown as Float32Array<ArrayBuffer>);
    const binHz = ctx.sampleRate / an.fftSize;
    // ~0.5 s stabilizing EMA so the scale is steady, not jittery.
    for (let i = 0; i < sm.length; i++) {
      const v = isFinite(buf[i]) ? buf[i] : -140;
      sm[i] = sm[i] * 0.88 + v * 0.12;
    }
    return pickPeaks(sm, binHz);
  }, []);

  // ── The frame: derive the scale, drive autopilot, emit throttled state ───────
  const frame = useCallback(() => {
    const now = performance.now();
    const peaks =
      sourceRef.current === "mic"
        ? readMicPeaks()
        : syntheticRef.current
          ? syntheticRef.current(now)
          : [];
    const { f0, degrees } = deriveScale(peaks);
    scaleRef.current = { f0, degrees };

    if (autopilotRef.current && degrees.length > 0 && ctxRef.current) {
      if (now >= demoNextRef.current) {
        runAutopilotStep(now);
        demoNextRef.current = now + 380;
      }
    }

    if (now - lastEmitRef.current > 33) {
      lastEmitRef.current = now;
      const folded =
        f0 > 0
          ? peaks.map((p) => ({
              cents: centsOf(foldToOctave(p.freq / f0)),
              mag: p.mag,
            }))
          : [];
      setFrameData({
        f0,
        degrees,
        peaks: folded,
        active: Array.from(activeRef.current),
      });
    }
  }, [readMicPeaks, runAutopilotStep]);
  frameRef.current = frame;

  // ── Mount: build audio, seed synthetic spectrum, start the loop ──────────────
  useEffect(() => {
    try {
      const Ctor =
        window.AudioContext || (window as WinWithWebkit).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio API unavailable.");
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.16; // ear-safe cap
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      master.connect(lp);
      lp.connect(comp);
      comp.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      ctx.resume().catch(() => {}); // best-effort autoplay for hands-off review
    } catch (e) {
      setAudioError(
        "Web Audio unavailable — the tuning wheel is shown silently. " +
          (e instanceof Error ? e.message : ""),
      );
    }

    syntheticRef.current = makeSyntheticSpectrum(0x4056);
    autopilotRef.current = true;
    setAutopilot(true);
    demoNextRef.current = performance.now() + 300;
    setReady(true);

    let alive = true;
    const loop = () => {
      if (!alive) return;
      frameRef.current();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      alive = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      voicesRef.current.forEach((v) => {
        try {
          v.oscs.forEach((o) => o.stop());
        } catch {
          /* ignore */
        }
      });
      voicesRef.current.clear();
      if (autoVoiceRef.current) {
        try {
          autoVoiceRef.current.oscs.forEach((o) => o.stop());
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── QWERTY keyboard input ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const idx = KEY_ROW.indexOf(e.key.toLowerCase() as (typeof KEY_ROW)[number]);
      if (idx < 0) return;
      handover();
      const { degrees } = scaleRef.current;
      if (!degrees.length) return;
      const octave = Math.floor(idx / degrees.length);
      const degIdx = idx % degrees.length;
      playDegree(`k-${idx}`, degIdx, octave, 0.85);
    };
    const up = (e: KeyboardEvent) => {
      const idx = KEY_ROW.indexOf(e.key.toLowerCase() as (typeof KEY_ROW)[number]);
      if (idx < 0) return;
      stopDegree(`k-${idx}`);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ready, handover, playDegree, stopDegree]);

  // ── Start the mic (grants raw signal + hands over) ───────────────────────────
  const startMic = useCallback(async () => {
    resumeAudio();
    const ctx = ctxRef.current;
    if (!ctx) {
      setMicError("Audio context unavailable — running the synthetic spectrum.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 8192;
      an.smoothingTimeConstant = 0.3;
      src.connect(an); // NOT connected to destination — no feedback
      analyserRef.current = an;
      freqBufRef.current = new Float32Array(
        new ArrayBuffer(an.frequencyBinCount * 4),
      );
      smoothedBufRef.current = new Float32Array(an.frequencyBinCount).fill(-140);
      sourceRef.current = "mic";
      setMicOn(true);
      setMicError(null);
      handover();
    } catch (e) {
      setMicError(
        "Microphone unavailable — running the seeded synthetic spectrum instead. " +
          (e instanceof Error ? e.message : ""),
      );
    }
  }, [resumeAudio, handover]);

  const toggleAutopilot = useCallback(() => {
    if (autopilotRef.current) {
      handover();
    } else {
      autopilotRef.current = true;
      setAutopilot(true);
      demoNextRef.current = performance.now();
    }
  }, [handover]);

  // ── SVG geometry ─────────────────────────────────────────────────────────────
  const CX = 240;
  const CY = 240;
  const R = 158; // degree ring radius
  const LR = 196; // label radius
  const PR = 178; // incoming-peak arc radius
  const angleOf = (cents: number) => (cents / 1200) * Math.PI * 2 - Math.PI / 2;
  const posOf = (cents: number, r: number): [number, number] => {
    const a = angleOf(cents);
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };

  const { f0, degrees, peaks, active } = frameData;
  const activeSet = new Set(active);
  const gridTicks = Array.from({ length: 12 }, (_, i) => i * 100);
  const sourceLabel = micOn ? "microphone" : "synthetic 0x4056";

  return (
    <main className="min-h-screen bg-[#050409] px-4 py-6 font-sans text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <Link
            href="/dream"
            className="font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream lab
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Overtone Loom
          </h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            What if a sound generated its own scale? Sing or play into the mic —
            the piece reads your strongest spectral peaks and their harmonic
            recurrence, derives a bespoke microtonal tuning from them, and hands
            you a keyboard tuned to your own fingerprint. Nothing is imposed: no
            12-TET, no snap-to-pentatonic. Change what you hum, the scale
            re-derives.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={startMic}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {micOn ? "Mic live ●" : "Start mic"}
            </button>
            <button
              onClick={toggleAutopilot}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {autopilot ? "Pause autopilot" : "Resume autopilot"}
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          {micError && (
            <p className="mt-3 font-mono text-sm text-destructive">{micError}</p>
          )}
          {audioError && (
            <p className="mt-3 font-mono text-sm text-destructive">{audioError}</p>
          )}
        </header>

        {/* status row */}
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-sm">
          <span className="text-muted-foreground">
            source: <span className="text-primary">{sourceLabel}</span>
          </span>
          <span className="text-muted-foreground">
            f0:{" "}
            <span className="tabular-nums text-foreground">
              {f0 > 0 ? `${f0.toFixed(1)} Hz` : "—"}
            </span>
          </span>
          <span className="text-muted-foreground">
            degrees:{" "}
            <span className="tabular-nums text-foreground">{degrees.length}</span>
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── The tuning wheel (SVG) ───────────────────────────────────────── */}
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <svg
              viewBox="0 0 480 480"
              className="block w-full"
              style={{ maxHeight: "70vh" }}
              role="img"
              aria-label="Log-frequency tuning wheel of the derived microtonal scale"
            >
              {/* outer ring */}
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={VIOLET[800]}
                strokeWidth={1}
              />
              <circle
                cx={CX}
                cy={CY}
                r={R * 0.62}
                fill="none"
                stroke={VIOLET[900]}
                strokeWidth={1}
              />

              {/* 100-cent grid ticks */}
              {gridTicks.map((c) => {
                const [x1, y1] = posOf(c, R);
                const [x2, y2] = posOf(c, R + 7);
                return (
                  <line
                    key={`tick-${c}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={c === 0 ? VIOLET[500] : VIOLET[700]}
                    strokeWidth={c === 0 ? 1.5 : 0.75}
                    opacity={c === 0 ? 0.9 : 0.5}
                  />
                );
              })}

              {/* incoming raw peaks — faint arcs before they crystallise */}
              {peaks.map((p, i) => {
                const [x, y] = posOf(p.cents, PR);
                return (
                  <circle
                    key={`peak-${i}`}
                    cx={x}
                    cy={y}
                    r={2 + p.mag * 3}
                    fill={VIOLET[400]}
                    opacity={0.12 + p.mag * 0.22}
                  />
                );
              })}

              {/* radial spokes to each derived degree */}
              {degrees.map((d, i) => {
                const [x, y] = posOf(d.cents, R);
                const on = activeSet.has(i);
                return (
                  <line
                    key={`spoke-${i}`}
                    x1={CX}
                    y1={CY}
                    x2={x}
                    y2={y}
                    stroke={on ? VIOLET[300] : VIOLET[600]}
                    strokeWidth={on ? 1.6 : 0.75}
                    opacity={on ? 0.95 : 0.4}
                  />
                );
              })}

              {/* degree nodes + labels */}
              {degrees.map((d, i) => {
                const [x, y] = posOf(d.cents, R);
                const [lx, ly] = posOf(d.cents, LR);
                const on = activeSet.has(i);
                return (
                  <g key={`deg-${i}`}>
                    {on && (
                      <circle cx={x} cy={y} r={13} fill={VIOLET[400]} opacity={0.28} />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={on ? 6 : 4}
                      fill={on ? VIOLET[100] : VIOLET[300]}
                      stroke={VIOLET[500]}
                      strokeWidth={on ? 1.5 : 0.75}
                    />
                    <text
                      x={lx}
                      y={ly - 3}
                      textAnchor="middle"
                      fontSize={11}
                      fontFamily="ui-monospace, monospace"
                      fill={on ? VIOLET[100] : VIOLET[200]}
                    >
                      {d.label}
                    </text>
                    <text
                      x={lx}
                      y={ly + 9}
                      textAnchor="middle"
                      fontSize={9}
                      fontFamily="ui-monospace, monospace"
                      fill={VIOLET[400]}
                    >
                      {d.cents.toFixed(0)}¢
                    </text>
                  </g>
                );
              })}

              {/* center readout */}
              <text
                x={CX}
                y={CY - 4}
                textAnchor="middle"
                fontSize={13}
                fontFamily="ui-monospace, monospace"
                fill={VIOLET[200]}
              >
                {f0 > 0 ? `${f0.toFixed(0)} Hz` : "listening"}
              </text>
              <text
                x={CX}
                y={CY + 12}
                textAnchor="middle"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                fill={VIOLET[500]}
              >
                f0 · 1 octave = 360°
              </text>
            </svg>
          </div>

          {/* ── Scale readout + legend ───────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Derived scale
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Peaks → degrees, ratios → intervals. Each row is an exact frequency
              ratio, not a tempered note.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-sm">
              {degrees.length === 0 && (
                <li className="text-muted-foreground">deriving…</li>
              )}
              {degrees.map((d, i) => {
                const on = activeSet.has(i);
                const keyForDeg =
                  i < KEY_ROW.length ? KEY_ROW[i].toUpperCase() : "·";
                return (
                  <li
                    key={`row-${i}`}
                    className={`flex items-center justify-between rounded px-2 py-1 ${
                      on ? "bg-primary/20 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="tabular-nums">
                      <span className="text-primary">{keyForDeg}</span>{" "}
                      {d.label}
                    </span>
                    <span className="tabular-nums">{d.cents.toFixed(1)}¢</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <p>
                <span style={{ color: VIOLET[300] }}>●</span> derived degree ·{" "}
                <span style={{ color: VIOLET[400] }}>●</span> incoming peak
              </p>
              <p>Bright glow = currently sounding degree.</p>
            </div>
          </div>
        </div>

        {/* ── On-screen keyboard ─────────────────────────────────────────────── */}
        <div className="mt-5 select-none">
          <div className="flex h-28 w-full gap-[3px] overflow-hidden rounded-lg border border-border">
            {KEY_ROW.map((k, idx) => {
              const n = degrees.length;
              const degIdx = n ? idx % n : 0;
              const octave = n ? Math.floor(idx / n) : 0;
              const deg = degrees[degIdx];
              const on = deg ? activeSet.has(degIdx) : false;
              return (
                <button
                  key={k}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    handover();
                    if (degrees.length) playDegree(`p-${idx}`, degIdx, octave, 0.85);
                  }}
                  onPointerUp={() => stopDegree(`p-${idx}`)}
                  onPointerCancel={() => stopDegree(`p-${idx}`)}
                  onPointerLeave={(e) => {
                    if (e.buttons) stopDegree(`p-${idx}`);
                  }}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-end gap-1 pb-2 transition-colors ${
                    on
                      ? "bg-primary/25 text-foreground"
                      : "bg-[#0c0a14] text-muted-foreground hover:bg-primary/15"
                  }`}
                >
                  <span className="font-mono text-xs uppercase">{k}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {deg ? `${deg.cents.toFixed(0)}¢` : "—"}
                    {octave > 0 ? "↑" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Press <span className="font-mono text-foreground">A S D F G H J K L</span>{" "}
            or tap the wheel nodes to play the derived degrees across two octaves.
            The first mic or keypress hands over from the autopilot.
          </p>
        </div>
      </div>

      {/* ── Design-notes modal ───────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                The tuning is <span className="text-foreground">derived from the
                signal</span>, never imposed. This is the Biotuner approach
                (Antoine Bellemare&apos;s <span className="text-foreground">harmonic
                recurrence</span>): the strongest spectral peaks of your
                voice/instrument become scale degrees, and the ratios between
                peaks become intervals.
              </p>
              <p className="font-mono text-xs text-foreground">
                f0 = lowest strong peak
                <br />
                ratio = peak / f0, folded into [1, 2)
                <br />
                cents = 1200 · log₂(ratio)
                <br />
                snap → nearest just ratio within 18¢ (3/2, 5/4, 7/4 …)
                <br />
                dedup degrees closer than 15¢
              </p>
              <p>
                An 8192-point FFT feeds an ~0.5 s smoothed spectrum, so the scale
                is stable rather than jittery. With no mic, a deterministic
                synthetic spectrum seeded by{" "}
                <span className="font-mono text-foreground">mulberry32(0x4056)</span>{" "}
                random-walks a few peaks so the scale visibly re-derives and the
                autopilot arpeggiates it.
              </p>
              <p>
                Full write-up, math and known limits are in{" "}
                <span className="font-mono text-foreground">README.md</span> in
                this prototype&apos;s folder.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
