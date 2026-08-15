"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13696 · Callback — improvise a duet WITH one of Karel's own recordings.
//
//   ONE QUESTION
//   What if you could improvise a duet WITH one of Karel's own recordings — he
//   plays a phrase, then it's your turn, and the keys you answer on are voiced
//   entirely by grains of HIS OWN piano sound?
//
//   INPUT   on-screen playable keys (pointer/touch) + the computer keyboard row
//           A S D F G H J K mapped to a C-major-pentatonic scale. No mic.
//   OUTPUT  SVG — a call/response timeline (his phrase lane, your answer lane, a
//           sweeping playhead) plus a key-row that lights on press. No Canvas2D.
//   VERB    concatenative / corpus grain instrument: each key triggers a short
//           grain sampled from Karel's real recording, pitch-shifted (via
//           AudioBufferSource.playbackRate) to that scale degree and windowed —
//           so every note you play is his piano tone, re-voiced. A loose
//           call-and-response clock plays a real segment of his recording (the
//           "call"), opens a "YOUR TURN" rest, then advances to the next phrase.
//
//   REFS  IRCAM CataRT (Diemo Schwarz — corpus-based concatenative synthesis);
//         "The Concatenator: A Bayesian Approach to Real-Time Concatenative
//         Musaicing" (arXiv:2411.04366). Borrowed idea: play an instrument built
//         from a corpus of ONE recording's grains, wrapped in a duet frame.
//
//   AUDIO Karel's verified catalog ONLY (Welcome Home + Snowflake), routed
//         through the shared safeMaster ear-safety bus. No synth/oscillator tones.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  REAL_TRACKS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { VIOLET } from "../_shared/palette";
import { extractGrains, segmentPeaks, type Grain } from "./grains";

// ── instrument constants ─────────────────────────────────────────────────────
const CYCLE_MS = 8000; // one call+response cycle
const CALL_FRAC = 0.5; // first half = his call, second half = your turn
const CALL_SEC = (CYCLE_MS / 1000) * CALL_FRAC; // 4s of his real recording
const BEATS = 8; // metronome beats per cycle
const GRAIN_COUNT = 7; // size of the timbre corpus

// C major pentatonic across the 8 keys (semitones, centred so pitch sits well).
const KEY_SEMIS = [-7, -5, -3, 0, 2, 5, 7, 9];
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K"];
const KEY_CODES = ["a", "s", "d", "f", "g", "h", "j", "k"];
const SEMI_MIN = Math.min(...KEY_SEMIS);
const SEMI_MAX = Math.max(...KEY_SEMIS);

// ── SVG geometry ─────────────────────────────────────────────────────────────
const W = 1000;
const H = 460;
const X0 = 70;
const X1 = 930;
const WIN = X1 - X0;
const CALL_X1 = X0 + CALL_FRAC * WIN;
const HIS_MID = 92;
const YOUR_TOP = 150;
const YOUR_H = 96;
const TICK_Y = 268;
const KEY_TOP = 300;
const KEY_BOT = 440;

// ── art palette (raw colours allowed inside the SVG art layer) ───────────────
const GROUND = "#0a0a0b";
const STAFF = "#e8e8ef"; // off-white ink
const ACCENT = VIOLET[500]; // #8b5cf6
const ACCENT_SOFT = VIOLET[300];

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const xForPos = (pos: number) => X0 + pos * WIN;

interface Hit {
  t: number; // performance.now() when played
  pos: number; // cycle position 0..1 at play time
  key: number; // 0..7
}

interface HitView extends Hit {
  age: number; // 0..1 across two cycles
}

interface View {
  pos: number;
  inCall: boolean;
  level: number;
  hits: HitView[];
  active: number[];
}

const EMPTY_VIEW: View = { pos: 0, inCall: true, level: 0, hits: [], active: [] };

// ── one grain voice: a pitch-shifted, windowed slice of Karel's recording ────
function triggerGrain(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  grain: Grain,
  rate: number,
  gainMul: number,
  delaySec = 0,
) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;

  const g = ctx.createGain();
  const outLen = grain.durSec / rate; // audible length after pitch shift
  const t = ctx.currentTime + delaySec;
  const peak = 0.9 * gainMul;
  const atk = 0.008;
  const rel = Math.min(0.05, outLen * 0.4);
  const hold = Math.max(t + atk + 0.001, t + outLen - rel);

  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak, hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + outLen);

  src.connect(g).connect(dest);
  src.start(t, grain.startSec, grain.durSec);
  src.stop(t + outLen + 0.03);
  src.onended = () => {
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* ctx closing */
    }
  };
}

export default function CallbackPage() {
  // audio graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const grainsRef = useRef<Grain[]>([]);
  const callSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const freqRef = useRef<Uint8Array>(new Uint8Array(0));

  // clock refs
  const startTimeRef = useRef<number | null>(null);
  const lastCycleRef = useRef<number>(-1);
  const callOffsetRef = useRef<number>(0.5);
  const grainIdxRef = useRef<number>(0);
  const gainRef = useRef<number>(0.85);

  // input / visual refs
  const hitsRef = useRef<Hit[]>([]);
  const activeRef = useRef<Set<number>>(new Set());
  const flashTimersRef = useRef<number[]>([]);

  // react state
  const [selectedId, setSelectedId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [grainIdx, setGrainIdx] = useState(0);
  const [gain, setGain] = useState(0.85);
  const [callPeaks, setCallPeaks] = useState<number[]>([]);
  const [view, setView] = useState<View>(EMPTY_VIEW);

  const title =
    REAL_TRACKS.find((t) => t.id === selectedId)?.title ?? "Welcome Home";

  // ── schedule the "call": play a real segment of his recording ──────────────
  const scheduleCall = useCallback(() => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    const buf = bufferRef.current;
    if (!ctx || !safe || !buf) return;

    let off = callOffsetRef.current;
    if (off + CALL_SEC > buf.duration - 0.2) off = 0.5; // wrap to the top

    if (callSrcRef.current) {
      try {
        callSrcRef.current.stop();
      } catch {
        /* already stopped */
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const fade = 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + fade);
    g.gain.setValueAtTime(0.85, t + CALL_SEC - fade);
    g.gain.exponentialRampToValueAtTime(0.0001, t + CALL_SEC);
    src.connect(g).connect(safe.input);
    src.start(t, off, CALL_SEC);
    src.stop(t + CALL_SEC + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ctx closing */
      }
    };
    callSrcRef.current = src;

    setCallPeaks(segmentPeaks(buf, off, CALL_SEC, 72));
    callOffsetRef.current = off + CALL_SEC; // advance to the next phrase
  }, []);

  // ── play one key: a grain of HIS sound, pitch-shifted to that degree ───────
  const playKey = useCallback((i: number) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    const buf = bufferRef.current;
    const grains = grainsRef.current;
    if (!ctx || !safe || !buf || grains.length === 0) return;

    const grain = grains[grainIdxRef.current % grains.length];
    const rate = Math.pow(2, KEY_SEMIS[i] / 12);
    triggerGrain(ctx, safe.input, buf, grain, rate, 1);
    // subtle echo, quieter and a beat later, so the answer sits in his world
    triggerGrain(ctx, safe.input, buf, grain, rate, 0.34, 0.26);

    const now = performance.now();
    const st = startTimeRef.current;
    const pos = st != null ? ((now - st) % CYCLE_MS) / CYCLE_MS : 0;
    hitsRef.current.push({ t: now, pos, key: i });
    if (hitsRef.current.length > 96) hitsRef.current.shift();

    activeRef.current.add(i);
    const id = window.setTimeout(() => activeRef.current.delete(i), 150);
    flashTimersRef.current.push(id);
    if (flashTimersRef.current.length > 64)
      flashTimersRef.current.shift();
  }, []);

  // ── (re)load a track buffer + rebuild the grain corpus ─────────────────────
  const reloadTrack = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    setLoadingTrack(true);
    try {
      const { buffer } = await loadRealTrackBuffer(ctx, id);
      bufferRef.current = buffer;
      grainsRef.current = extractGrains(buffer, GRAIN_COUNT);
      callOffsetRef.current = grainsRef.current[0]?.startSec ?? 0.5;
      grainIdxRef.current = 0;
      setGrainIdx(0);
      lastCycleRef.current = -1; // re-arm the call on the next frame
      setError(null);
    } catch {
      setError("Couldn't load that recording. Try another track.");
    } finally {
      setLoadingTrack(false);
    }
  }, []);

  // ── start: build the audio graph, load Karel's buffer, run the clock ───────
  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      safe.setGain(gainRef.current);
      ctxRef.current = ctx;
      safeRef.current = safe;
      freqRef.current = new Uint8Array(safe.analyser.fftSize);

      const { buffer } = await loadRealTrackBuffer(ctx, selectedId);
      bufferRef.current = buffer;
      grainsRef.current = extractGrains(buffer, GRAIN_COUNT);
      callOffsetRef.current = grainsRef.current[0]?.startSec ?? 0.5;

      startTimeRef.current = performance.now();
      lastCycleRef.current = -1;
      setStarted(true);
    } catch {
      setError(
        "Couldn't load Karel's recording. Check your connection and try again.",
      );
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
      ctxRef.current = null;
      safeRef.current = null;
    } finally {
      setStarting(false);
    }
  }, [starting, selectedId]);

  // ── the render / clock loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const loop = () => {
      const st = startTimeRef.current;
      if (st != null) {
        const now = performance.now();
        const elapsed = now - st;
        const cycleIndex = Math.floor(elapsed / CYCLE_MS);
        const pos = (elapsed % CYCLE_MS) / CYCLE_MS;

        if (cycleIndex !== lastCycleRef.current) {
          lastCycleRef.current = cycleIndex;
          scheduleCall();
        }

        let level = 0;
        const an = safeRef.current?.analyser;
        if (an) {
          const arr = freqRef.current;
          an.getByteTimeDomainData(arr as Uint8Array<ArrayBuffer>);
          let s = 0;
          for (let i = 0; i < arr.length; i++) {
            const v = (arr[i] - 128) / 128;
            s += v * v;
          }
          level = Math.sqrt(s / arr.length);
        }

        const cutoff = now - CYCLE_MS * 2;
        const kept = hitsRef.current.filter((h) => h.t > cutoff);
        hitsRef.current = kept;

        setView({
          pos,
          inCall: pos < CALL_FRAC,
          level,
          hits: kept.map((h) => ({ ...h, age: (now - h.t) / (CYCLE_MS * 2) })),
          active: Array.from(activeRef.current),
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, scheduleCall]);

  // ── keyboard row input ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = KEY_CODES.indexOf(e.key.toLowerCase());
      if (i >= 0) {
        e.preventDefault();
        playKey(i);
      } else if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const n = grainsRef.current.length || 1;
        const next =
          (grainIdxRef.current + (e.key === "]" ? 1 : n - 1)) % n;
        grainIdxRef.current = next;
        setGrainIdx(next);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [started, playKey]);

  // ── unmount: tear the whole audio graph down ───────────────────────────────
  useEffect(() => {
    return () => {
      flashTimersRef.current.forEach((id) => clearTimeout(id));
      flashTimersRef.current = [];
      if (callSrcRef.current) {
        try {
          callSrcRef.current.stop();
        } catch {
          /* already stopped */
        }
      }
      const s = safeRef.current;
      if (s) s.disconnect();
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
    };
  }, []);

  const cycleGrain = (dir: number) => {
    const n = grainsRef.current.length || 1;
    const next = (grainIdxRef.current + (dir > 0 ? 1 : n - 1)) % n;
    grainIdxRef.current = next;
    setGrainIdx(next);
  };

  const onSelectTrack = (id: string) => {
    setSelectedId(id);
    if (started) void reloadTrack(id);
  };

  const applyGain = (v: number) => {
    setGain(v);
    gainRef.current = v;
    safeRef.current?.setGain(v);
  };

  // ── derived render values ──────────────────────────────────────────────────
  const { pos, inCall, level, hits, active } = view;
  const playX = xForPos(pos);
  const beatIdx = Math.floor(pos * BEATS);
  const keyGap = WIN / KEY_LABELS.length;
  const keyW = keyGap - 8;
  const glow = clamp(level * 2.4, 0, 1);

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8 sm:px-10">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            ← all prototypes
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Callback
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Improvise a duet with one of Karel&apos;s own recordings — he plays a
            phrase, then it&apos;s your turn, and every key you answer on is voiced
            by grains of his own piano sound.
          </p>
        </header>

        {/* ── the SVG stage ── */}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full min-w-[640px] select-none rounded-lg"
            style={{ background: GROUND }}
            role="img"
            aria-label="Call-and-response timeline with a playable key row"
          >
            {/* region backgrounds */}
            <rect
              x={X0}
              y={40}
              width={CALL_X1 - X0}
              height={TICK_Y - 40}
              fill={STAFF}
              opacity={inCall ? 0.06 : 0.03}
            />
            <rect
              x={CALL_X1}
              y={40}
              width={X1 - CALL_X1}
              height={TICK_Y - 40}
              fill={ACCENT}
              opacity={inCall ? 0.05 : 0.14 + glow * 0.08}
            />

            {/* lane labels */}
            <text x={X0} y={32} fontSize={13} fill={STAFF} opacity={0.75} fontFamily="ui-sans-serif, system-ui">
              KAREL — the call
            </text>
            <text
              x={CALL_X1 + 8}
              y={32}
              fontSize={13}
              fill={inCall ? STAFF : ACCENT_SOFT}
              opacity={inCall ? 0.5 : 1}
              fontFamily="ui-sans-serif, system-ui"
              fontWeight={inCall ? 400 : 600}
            >
              YOUR TURN
            </text>

            {/* faint staff lines in the answer lane */}
            {[0, 0.5, 1].map((f) => (
              <line
                key={f}
                x1={X0}
                x2={X1}
                y1={YOUR_TOP + f * YOUR_H}
                y2={YOUR_TOP + f * YOUR_H}
                stroke={STAFF}
                strokeWidth={1}
                opacity={0.12}
              />
            ))}

            {/* his call waveform */}
            {callPeaks.map((p, k) => {
              const bw = (CALL_X1 - X0) / callPeaks.length;
              const x = X0 + k * bw + bw / 2;
              const half = 4 + p * 34;
              const near = Math.abs(x - playX) < bw * 1.6 && inCall;
              return (
                <line
                  key={k}
                  x1={x}
                  x2={x}
                  y1={HIS_MID - half}
                  y2={HIS_MID + half}
                  stroke={near ? ACCENT_SOFT : STAFF}
                  strokeWidth={Math.max(1.4, bw * 0.5)}
                  opacity={near ? 0.95 : 0.45}
                  strokeLinecap="round"
                />
              );
            })}

            {/* your answered notes */}
            {hits.map((h, k) => {
              const x = xForPos(h.pos);
              const norm = (KEY_SEMIS[h.key] - SEMI_MIN) / (SEMI_MAX - SEMI_MIN);
              const y = YOUR_TOP + (1 - norm) * YOUR_H;
              const fade = clamp(1 - h.age, 0, 1);
              return (
                <g key={`${h.t}-${k}`} opacity={fade}>
                  <line
                    x1={x}
                    x2={x}
                    y1={y}
                    y2={YOUR_TOP + YOUR_H}
                    stroke={ACCENT}
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                  <circle cx={x} cy={y} r={4 + glow * 5 * fade} fill={ACCENT} />
                </g>
              );
            })}

            {/* call / turn divider */}
            <line
              x1={CALL_X1}
              x2={CALL_X1}
              y1={40}
              y2={TICK_Y - 6}
              stroke={STAFF}
              strokeWidth={1}
              strokeDasharray="3 5"
              opacity={0.35}
            />

            {/* metronome beats */}
            {Array.from({ length: BEATS }).map((_, b) => {
              const x = X0 + (b / BEATS) * WIN + WIN / BEATS / 2;
              const on = b === beatIdx;
              return (
                <circle
                  key={b}
                  cx={x}
                  cy={TICK_Y}
                  r={on ? 4 + glow * 3 : 2.5}
                  fill={b < BEATS * CALL_FRAC ? STAFF : ACCENT}
                  opacity={on ? 1 : 0.35}
                />
              );
            })}

            {/* playhead */}
            <rect
              x={playX - 5}
              y={40}
              width={10}
              height={TICK_Y - 46}
              fill={ACCENT}
              opacity={0.12 + glow * 0.14}
            />
            <line
              x1={playX}
              x2={playX}
              y1={40}
              y2={TICK_Y - 6}
              stroke={inCall ? STAFF : ACCENT_SOFT}
              strokeWidth={2}
            />
            <circle cx={playX} cy={44} r={4 + glow * 3} fill={inCall ? STAFF : ACCENT_SOFT} />

            {/* the key row */}
            {KEY_LABELS.map((lab, i) => {
              const x = X0 + i * keyGap + 4;
              const isActive = active.includes(i);
              const lift = isActive ? 4 : 0;
              return (
                <g
                  key={lab}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    playKey(i);
                  }}
                  style={{ cursor: started ? "pointer" : "default" }}
                >
                  {isActive && (
                    <rect
                      x={x - 3}
                      y={KEY_TOP - lift - 3}
                      width={keyW + 6}
                      height={KEY_BOT - KEY_TOP + 6}
                      rx={8}
                      fill={ACCENT}
                      opacity={0.25 + glow * 0.25}
                    />
                  )}
                  <rect
                    x={x}
                    y={KEY_TOP - lift}
                    width={keyW}
                    height={KEY_BOT - KEY_TOP}
                    rx={6}
                    fill={isActive ? ACCENT : "#141418"}
                    stroke={isActive ? ACCENT_SOFT : STAFF}
                    strokeOpacity={isActive ? 1 : 0.22}
                    strokeWidth={1.5}
                  />
                  <text
                    x={x + keyW / 2}
                    y={KEY_BOT - 20 - lift}
                    fontSize={18}
                    fontWeight={600}
                    textAnchor="middle"
                    fill={isActive ? "#0a0a0b" : STAFF}
                    opacity={isActive ? 1 : 0.85}
                    fontFamily="ui-sans-serif, system-ui"
                  >
                    {lab}
                  </text>
                  <text
                    x={x + keyW / 2}
                    y={KEY_TOP + 22 - lift}
                    fontSize={10}
                    textAnchor="middle"
                    fill={isActive ? "#0a0a0b" : STAFF}
                    opacity={isActive ? 0.7 : 0.4}
                    fontFamily="ui-monospace, monospace"
                  >
                    {KEY_SEMIS[i] >= 0 ? `+${KEY_SEMIS[i]}` : KEY_SEMIS[i]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── error notice ── */}
        {error && (
          <p className="text-base text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* ── controls ── */}
        <div className="flex flex-col gap-6">
          {!started ? (
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void start()}
                disabled={starting}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {starting ? "Loading Karel's piano…" : "Begin the duet"}
              </button>
              <p className="text-sm text-muted-foreground">
                Loads a real recording, then hands you a keyboard made of his sound.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Play <span className="text-foreground">A S D F G H J K</span> (or tap
              the keys) to answer during{" "}
              <span className="text-primary">YOUR TURN</span> — every note is a
              grain of <span className="text-foreground">{title}</span>, re-voiced.
              Use <span className="text-foreground">[</span> /{" "}
              <span className="text-foreground">]</span> to swap which grain of his
              sound the keys are made of.
            </p>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* track */}
            <section className="space-y-2">
              <label
                htmlFor="cb-track"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                His recording {loadingTrack && "· loading…"}
              </label>
              <select
                id="cb-track"
                value={selectedId}
                onChange={(e) => onSelectTrack(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
              >
                {REAL_TRACKS.map((tk) => (
                  <option key={tk.id} value={tk.id}>
                    {tk.title}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Both his call and the grains under your keys come from this take.
              </p>
            </section>

            {/* timbre grain */}
            <section className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Timbre grain
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => cycleGrain(-1)}
                  disabled={!started}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  ◀
                </button>
                <span className="min-w-[6ch] text-center text-base text-foreground">
                  {started ? `${grainIdx + 1} / ${grainsRef.current.length || GRAIN_COUNT}` : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => cycleGrain(1)}
                  disabled={!started}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  ▶
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Each grain is a different attack sampled from his recording — the
                corpus your instrument is built from.
              </p>
            </section>

            {/* output level */}
            <section className="space-y-2">
              <label
                htmlFor="cb-gain"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                Output level
              </label>
              <input
                id="cb-gain"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={gain}
                onChange={(e) => applyGain(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-sm text-muted-foreground">
                Routed through the shared ear-safety master bus.
              </p>
            </section>

            {/* status */}
            <section className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Now
              </p>
              <p className="text-base text-foreground">
                {!started
                  ? "Waiting to begin"
                  : inCall
                    ? "Karel is playing — listen"
                    : "Your turn — answer him"}
              </p>
              <p className="text-sm text-muted-foreground">
                A loose 8-beat clock: 4 beats of his phrase, 4 beats for you, then
                he advances to the next phrase.
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* ── design notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                could improvise a duet with one of Karel&apos;s own recordings — he
                plays a phrase, then it&apos;s your turn, and the keys you answer on
                are voiced entirely by grains of his own piano sound?
              </p>
              <p>
                <span className="text-foreground">The instrument.</span> On load we
                scan the recording for clean attacks and grab a small corpus of
                short grains. Pressing a key triggers one of those grains,
                pitch-shifted via <code>playbackRate</code> to a C-major-pentatonic
                degree and windowed to avoid clicks — so the keyboard is literally
                made of his tone. This is corpus-based concatenative synthesis
                (IRCAM <span className="text-foreground">CataRT</span>, Diemo
                Schwarz; and <span className="text-foreground">The Concatenator</span>,
                arXiv:2411.04366), here reduced to a single recording&apos;s grains
                and wrapped in a duet frame.
              </p>
              <p>
                <span className="text-foreground">The frame.</span> A loose 8-beat
                clock alternates his call (4 beats of the real buffer) with your
                turn (4 beats), then advances to the next phrase. The timeline is
                pure SVG: his phrase as a waveform lane, your answered notes as
                violet marks under the sweeping playhead, and a key-row that lights
                on press and pulses with the master analyser.
              </p>
              <p>
                <span className="text-foreground">Next-cycle deepening.</span>
                Nearest-grain selection by target pitch/loudness (real CataRT
                matching) instead of one grain at a time; onset-aligned call
                phrases so his half always starts on a note; a memory that harmonises
                your answer back into his key; and a two-hand mode where the echo
                voice shadows you a third above.
              </p>
              <p>
                <span className="text-foreground">Audio.</span> Karel&apos;s verified
                catalog only (Welcome Home + Snowflake), every source routed through
                the shared safeMaster bus. No synth tones.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13696-callback"]} />
    </main>
  );
}
