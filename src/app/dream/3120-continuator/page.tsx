'use client';

// ─────────────────────────────────────────────────────────────────────────────
// 3120-continuator — a two-way vocal duet partner that learns YOUR idiom live.
//
//   You sing phrases; it answers with NEW phrases sampled from a variable-order
//   Markov model of everything you have sung (see model.ts). The longer you play,
//   the more it sounds like you. Named after François Pachet's *The Continuator*.
//
//   Pipeline (identical for live mic and the seeded headless autopilot):
//     LISTENING → segment the sung notes → (silence gap) → THINKING (ingest the
//     phrase into the idiom model) → ANSWERING (sing a generated phrase) →
//     LISTENING. Visuals are pure SVG: a two-lane call/response transcript plus a
//     live readout of the growing model.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createModel,
  ingestPhrase,
  generatePhrase,
  modelStats,
  makeDemoPhrases,
  mulberry32,
  type IdiomModel,
  type NoteEvent,
  type ModelStats,
  type GenResult,
} from './model';
import { trackPitch, NoteSegmenter } from './pitch';
import { buildSynth, singPhrase, hush, type SynthBus } from './synth';

const SEED = 0x3096;

// ── SVG transcript geometry ───────────────────────────────────────────────────
const VIEW_W = 920;
const VIEW_H = 340;
const PX_PER_SEC = 104;
const RECORD_GAP = 36;
const LANE = {
  humanTop: 44,
  humanBottom: 150,
  divider: 173,
  partnerTop: 196,
  partnerBottom: 302,
};
const COL = {
  human: '#a78bfa', // violet-400
  partner: '#c084fc', // purple-400
  pending: '#7c6f9c',
  grid: 'rgba(167,139,250,0.10)',
  playhead: '#e9d5ff',
};

type Phase = 'idle' | 'listening' | 'thinking' | 'answering';
type Mode = 'idle' | 'mic' | 'demo';
type Role = 'human' | 'partner';

interface PhraseRecord {
  id: number;
  role: Role;
  notes: NoteEvent[];
  gen?: GenResult;
}

interface Playhead {
  recordId: number;
  startPerfMs: number;
  durMs: number;
}

// ── layout (pure) ─────────────────────────────────────────────────────────────

interface LaidNote {
  x: number;
  y: number;
  cents: number;
}
interface LaidItem {
  id: number;
  role: Role | 'pending';
  x0: number;
  width: number;
  pts: LaidNote[];
  durs: number[];
}

function makeLayout(
  records: PhraseRecord[],
  pending: NoteEvent[]
): { items: LaidItem[]; translateX: number; totalWidth: number } {
  const seq: { id: number; role: Role | 'pending'; notes: NoteEvent[] }[] = records.map(
    (r) => ({ id: r.id, role: r.role, notes: r.notes })
  );
  if (pending.length > 0) {
    seq.push({ id: -1, role: 'pending', notes: pending });
  }

  // pitch range across everything visible
  let cLo = Infinity;
  let cHi = -Infinity;
  for (const s of seq) {
    for (const n of s.notes) {
      if (n.cents < cLo) cLo = n.cents;
      if (n.cents > cHi) cHi = n.cents;
    }
  }
  if (!Number.isFinite(cLo)) {
    cLo = -300;
    cHi = 300;
  }
  if (cHi - cLo < 400) {
    const mid = (cLo + cHi) / 2;
    cLo = mid - 200;
    cHi = mid + 200;
  }
  const pad = (cHi - cLo) * 0.12;
  cLo -= pad;
  cHi += pad;

  const yFor = (cents: number, role: Role | 'pending') => {
    const t = (cents - cLo) / (cHi - cLo);
    if (role === 'partner') {
      return LANE.partnerBottom - t * (LANE.partnerBottom - LANE.partnerTop);
    }
    return LANE.humanBottom - t * (LANE.humanBottom - LANE.humanTop);
  };

  const items: LaidItem[] = [];
  let cursor = 16;
  for (const s of seq) {
    let cum = 0;
    const pts: LaidNote[] = [];
    const durs: number[] = [];
    for (const n of s.notes) {
      const x = cursor + cum * PX_PER_SEC;
      pts.push({ x, y: yFor(n.cents, s.role), cents: n.cents });
      durs.push(n.dur);
      cum += n.dur;
    }
    const width = cum * PX_PER_SEC + 14;
    items.push({ id: s.id, role: s.role, x0: cursor, width, pts, durs });
    cursor += width + RECORD_GAP;
  }

  const totalWidth = cursor;
  const translateX = Math.min(0, VIEW_W - totalWidth - 16);
  return { items, translateX, totalWidth };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ContinuatorPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<PhraseRecord[]>([]);
  const [pendingHuman, setPendingHuman] = useState<NoteEvent[]>([]);
  const [stats, setStats] = useState<ModelStats>(() => modelStats(createModel()));
  const [lastGen, setLastGen] = useState<GenResult | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [, setPulse] = useState(0); // forces re-render for the playhead

  // audio + model refs (survive renders, drive the rAF loop)
  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<SynthBus | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);

  const modelRef = useRef<IdiomModel>(createModel());
  const rngRef = useRef<() => number>(mulberry32(SEED));
  const segRef = useRef<NoteSegmenter>(new NoteSegmenter());
  const currentPhraseRef = useRef<NoteEvent[]>([]);
  const recordIdRef = useRef(0);
  const demoIdxRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const playheadRef = useRef<Playhead | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const modeRef = useRef<Mode>('idle');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── timer helper (registered so teardown can cancel every pending step) ─────
  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current.clear();
  }, []);

  // ── audio context (created on a user gesture) ───────────────────────────────
  const ensureAudio = useCallback((): SynthBus | null => {
    if (ctxRef.current && synthRef.current) return synthRef.current;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') void ctx.resume();
      const bus = buildSynth(ctx);
      ctxRef.current = ctx;
      synthRef.current = bus;
      return bus;
    } catch {
      setError('Web Audio is unavailable in this browser — nothing to sing with.');
      return null;
    }
  }, []);

  const pushRecord = useCallback(
    (role: Role, notes: NoteEvent[], gen?: GenResult): PhraseRecord => {
      const rec: PhraseRecord = { id: recordIdRef.current++, role, notes, gen };
      setRecords((prev) => {
        const next = [...prev, rec];
        return next.length > 8 ? next.slice(next.length - 8) : next;
      });
      return rec;
    },
    []
  );

  const setPlayhead = useCallback((recordId: number, durSec: number) => {
    playheadRef.current = {
      recordId,
      startPerfMs: performance.now() + 60, // matches the 0.06s audio lead
      durMs: durSec * 1000,
    };
  }, []);

  // ── back to a listening/idle rest state after an answer ─────────────────────
  const rest = useCallback(() => {
    playheadRef.current = null;
    currentPhraseRef.current = [];
    setPendingHuman([]);
    segRef.current.reset(performance.now());
    if (modeRef.current === 'mic') {
      setPhase('listening');
    } else {
      setPhase('idle');
    }
  }, []);

  // ── THINKING → ANSWERING ────────────────────────────────────────────────────
  const thinkThenAnswer = useCallback(
    (humanNotes: NoteEvent[]) => {
      setPhase('thinking');
      ingestPhrase(modelRef.current, humanNotes);
      setStats(modelStats(modelRef.current));

      after(440, () => {
        const bus = synthRef.current;
        const ctx = ctxRef.current;
        if (!bus || !ctx) {
          rest();
          return;
        }
        const anchor = humanNotes[humanNotes.length - 1]?.cents ?? 0;
        const gen = generatePhrase(modelRef.current, rngRef.current, anchor);
        setLastGen(gen);

        if (gen.notes.length < 2) {
          // model has almost nothing yet — stay quiet, keep listening
          rest();
          return;
        }

        const rec = pushRecord('partner', gen.notes, gen);
        setPhase('answering');
        const start = ctx.currentTime + 0.06;
        const dur = singPhrase(bus.partner, gen.notes, start);
        setPlayhead(rec.id, dur);
        after(dur * 1000 + 320, rest);
      });
    },
    [after, pushRecord, setPlayhead, rest]
  );

  // ── respond to a human phrase (mic: already sung; demo: sing it first) ───────
  const respond = useCallback(
    (humanNotes: NoteEvent[], singHuman: boolean) => {
      const bus = synthRef.current;
      const ctx = ctxRef.current;
      if (!bus || !ctx) return;

      const rec = pushRecord('human', humanNotes);
      if (singHuman) {
        setPhase('listening');
        const start = ctx.currentTime + 0.06;
        const dur = singPhrase(bus.human, humanNotes, start);
        setPlayhead(rec.id, dur);
        after(dur * 1000 + 260, () => thinkThenAnswer(humanNotes));
      } else {
        thinkThenAnswer(humanNotes);
      }
    },
    [after, pushRecord, setPlayhead, thinkThenAnswer]
  );

  // ── rAF loop: mic analysis + turn detection + playhead animation ────────────
  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    const nowMs = performance.now();

    // mic: analyse, segment, detect end-of-turn
    if (
      modeRef.current === 'mic' &&
      phaseRef.current === 'listening' &&
      analyserRef.current &&
      ctxRef.current &&
      timeBufRef.current
    ) {
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
      const { hz, clarity, rms } = trackPitch(buf, ctxRef.current.sampleRate);
      const closed = segRef.current.push(hz, rms, clarity, nowMs);
      if (closed) {
        currentPhraseRef.current = [...currentPhraseRef.current, closed];
        setPendingHuman([...currentPhraseRef.current]);
      }

      // end of turn: enough sung + a silence gap
      const silence = segRef.current.silenceMs(nowMs);
      const provisional = segRef.current.hasPending() ? 1 : 0;
      if (silence > 450 && currentPhraseRef.current.length + provisional >= 2) {
        const tail = segRef.current.flush(nowMs);
        const phraseNotes = tail
          ? [...currentPhraseRef.current, tail]
          : [...currentPhraseRef.current];
        currentPhraseRef.current = [];
        if (phraseNotes.length >= 2) {
          setPendingHuman([]);
          respond(phraseNotes, false);
        } else {
          setPendingHuman([]);
          segRef.current.reset(nowMs);
        }
      }
    }

    // keep the playhead moving
    if (playheadRef.current) setPulse((p) => (p + 1) & 0xffff);
  }, [respond]);

  const startRaf = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // ── controls ────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    clearTimers();
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (synthRef.current) {
      hush(synthRef.current.partner);
      hush(synthRef.current.human);
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    playheadRef.current = null;
    currentPhraseRef.current = [];
    setPendingHuman([]);
    setPhase('idle');
    setMode('idle');
  }, [clearTimers]);

  const startMic = useCallback(async () => {
    setError(null);
    const bus = ensureAudio();
    if (!bus) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const ctx = ctxRef.current!;
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // NOT to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      segRef.current.reset(performance.now());
      currentPhraseRef.current = [];
      setMode('mic');
      setPhase('listening');
      startRaf();
    } catch {
      setError('No microphone — the seeded demo below still runs the full loop.');
    }
  }, [ensureAudio, startRaf]);

  // demo phrases: seeded once
  const demoPhrasesRef = useRef<NoteEvent[][]>(makeDemoPhrases(SEED));

  // stop only the mic input (keep audio graph for the demo)
  const stopMicOnly = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
  }, []);

  const playDemoPhrase = useCallback(() => {
    setError(null);
    const bus = ensureAudio();
    if (!bus) return;
    // don't stack demos: block while anything is mid-turn or still sounding
    if (phaseRef.current === 'thinking' || phaseRef.current === 'answering') return;
    if (modeRef.current === 'demo' && playheadRef.current) return;
    if (modeRef.current === 'mic') stopMicOnly();

    setMode('demo');
    startRaf();
    const phrases = demoPhrasesRef.current;
    const notes = phrases[demoIdxRef.current % phrases.length];
    demoIdxRef.current += 1;
    respond(notes, true);
  }, [ensureAudio, startRaf, respond, stopMicOnly]);

  const forget = useCallback(() => {
    clearTimers();
    if (synthRef.current) {
      hush(synthRef.current.partner);
      hush(synthRef.current.human);
    }
    modelRef.current = createModel();
    rngRef.current = mulberry32(SEED);
    segRef.current.reset(performance.now());
    demoIdxRef.current = 0;
    currentPhraseRef.current = [];
    playheadRef.current = null;
    setRecords([]);
    setPendingHuman([]);
    setLastGen(null);
    setStats(modelStats(modelRef.current));
    if (modeRef.current === 'mic') setPhase('listening');
    else setPhase('idle');
  }, [clearTimers]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (synthRef.current) synthRef.current.dispose();
      if (ctxRef.current) void ctxRef.current.close();
    };
  }, [clearTimers]);

  // ── layout for render ───────────────────────────────────────────────────────
  const { items, translateX } = makeLayout(records, pendingHuman);

  // active playhead position (read live from ref each render)
  let playX: number | null = null;
  let activeRecordId: number | null = null;
  let activeNoteIdx = -1;
  const ph = playheadRef.current;
  if (ph) {
    const item = items.find((it) => it.id === ph.recordId);
    if (item) {
      const elapsed = performance.now() - ph.startPerfMs;
      const frac = Math.max(0, Math.min(1, elapsed / ph.durMs));
      playX = item.x0 + frac * (item.width - 14);
      activeRecordId = ph.recordId;
      // which note is sounding
      let acc = 0;
      const total = item.durs.reduce((a, b) => a + b, 0) || 1;
      const elapsedSec = frac * total;
      for (let i = 0; i < item.durs.length; i++) {
        acc += item.durs[i];
        if (elapsedSec <= acc) {
          activeNoteIdx = i;
          break;
        }
      }
      if (activeNoteIdx < 0) activeNoteIdx = item.durs.length - 1;
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: 'idle',
    listening: 'listening',
    thinking: 'learning you',
    answering: 'answering',
  };

  return (
    <div className="relative flex h-full flex-col bg-background text-foreground">
      {/* header */}
      <header className="flex items-start justify-between gap-4 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Continuator</h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            A duet partner that learns your musical idiom live. Sing a phrase; it
            answers with a new one sampled from a model of everything you have
            sung — getting more like you the longer you play.
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Read the design notes
        </button>
      </header>

      {/* status row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 pt-4">
        <StatusDot phase={phase} label={phaseLabel[phase]} />
        <Stat label="idiom contexts" value={stats.uniqueContexts} />
        <Stat label="notes heard" value={stats.totalNotes} />
        <Stat label="phrases" value={stats.phrasesIngested} />
        <Stat
          label="answer order"
          value={lastGen ? lastGen.maxOrderUsed : '—'}
          hint={
            lastGen && lastGen.ordersPerStep.length
              ? lastGen.ordersPerStep.join(' ')
              : undefined
          }
        />
      </div>

      {/* SVG transcript */}
      <main className="min-h-0 flex-1 px-6 py-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full rounded-lg border border-border"
          aria-label="Two-lane call and response transcript: your contour above, the partner's answer below."
        >
          {/* lane backdrop + labels */}
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="rgba(139,92,246,0.03)" />
          <line
            x1="0"
            y1={LANE.divider}
            x2={VIEW_W}
            y2={LANE.divider}
            stroke={COL.grid}
            strokeWidth="1"
          />
          <text x="14" y="26" fill={COL.human} fontSize="11" fontFamily="monospace" opacity="0.75">
            YOU
          </text>
          <text
            x="14"
            y={LANE.divider + 24}
            fill={COL.partner}
            fontSize="11"
            fontFamily="monospace"
            opacity="0.75"
          >
            PARTNER
          </text>

          {/* scrolling content */}
          <g transform={`translate(${translateX} 0)`}>
            {items.map((item) => {
              const stroke =
                item.role === 'human'
                  ? COL.human
                  : item.role === 'partner'
                    ? COL.partner
                    : COL.pending;
              const isPending = item.role === 'pending';
              const path = item.pts.map((p) => `${p.x},${p.y}`).join(' ');
              return (
                <g key={item.id} opacity={isPending ? 0.5 : 1}>
                  {item.pts.length > 1 && (
                    <polyline
                      points={path}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isPending ? 1.5 : 2}
                      strokeOpacity={isPending ? 0.7 : 0.85}
                      strokeDasharray={isPending ? '4 4' : undefined}
                      strokeLinejoin="round"
                    />
                  )}
                  {item.pts.map((p, i) => {
                    const isActive = item.id === activeRecordId && i === activeNoteIdx;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={isActive ? 6.5 : 3.5}
                        fill={stroke}
                        fillOpacity={isActive ? 1 : 0.85}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* playhead */}
            {playX != null && (
              <line
                x1={playX}
                y1="8"
                x2={playX}
                y2={VIEW_H - 8}
                stroke={COL.playhead}
                strokeWidth="1.5"
                strokeOpacity="0.7"
              />
            )}
          </g>

          {items.length === 0 && (
            <text
              x={VIEW_W / 2}
              y={VIEW_H / 2}
              textAnchor="middle"
              fill="rgba(167,139,250,0.5)"
              fontSize="14"
              fontFamily="monospace"
            >
              start the mic and sing, or press &ldquo;Play a demo phrase&rdquo;
            </text>
          )}
        </svg>
      </main>

      {/* controls */}
      <footer className="flex flex-wrap items-center gap-3 px-6 pb-6">
        <button
          onClick={startMic}
          disabled={mode === 'mic'}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {mode === 'mic' ? 'Mic listening' : 'Start mic'}
        </button>
        <button
          onClick={playDemoPhrase}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Play a demo phrase
        </button>
        <button
          onClick={stopAll}
          disabled={mode === 'idle'}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          Stop
        </button>
        <button
          onClick={forget}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Forget everything
        </button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </footer>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </div>
  );
}

// ── small presentational pieces ───────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-base tabular-nums text-foreground">
        {value}
        {hint && <span className="ml-2 font-mono text-xs text-muted-foreground">[{hint}]</span>}
      </span>
    </div>
  );
}

function StatusDot({ phase, label }: { phase: Phase; label: string }) {
  const active = phase !== 'idle';
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          active ? 'bg-primary' : 'bg-muted-foreground/40'
        }`}
        aria-hidden
      />
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground">The question.</span> What if Resonance
            had a duet partner that learns your musical idiom live — you sing
            phrases, and it answers with new phrases sampled from a model of
            everything you have sung, getting more like you the longer you play?
          </p>
          <p>
            <span className="text-foreground">The engine.</span> A variable-order
            Markov model (a prefix tree) over your sung material. It models the
            sequence of pitch <em>intervals</em>, in cents kept continuous — never
            snapped to equal temperament — and note <em>durations</em>. Every turn
            it ingests your latest phrase, then generates a new answer by sampling
            the model: it starts at the highest context order and backs off to a
            lower order when the recent context is unseen. Because answers are
            resampled from your own intervals and durations, they stay in your
            style yet are never a literal repeat, and the model visibly accumulates
            — minute 8 is different from second 0 because of what you sang.
          </p>
          <p>
            <span className="text-foreground">Reference.</span> François Pachet, The
            Continuator (2002/2003) — the canonical system that continues a
            musician&rsquo;s playing in their own style via a variable-order Markov
            model.
          </p>
          <p>
            <span className="text-foreground">Signal path.</span> The mic is pitch-
            tracked with autocorrelation (~60 fps), segmented into notes by pitch
            stability and an energy gate; a ~450 ms silence gap ends your turn. The
            partner is a source-filter voice — a glottal wave through three formant
            band-passes — singing the generated phrase with continuous pitch glides.
          </p>
          <p>
            <span className="text-foreground">Headless honesty.</span> The seeded
            autopilot (mulberry32, seed 0x3096) feeds baked human contours through
            the exact same ingest→generate→sing loop, so the whole thing runs with
            no microphone. What a text review cannot verify: the actual sound of the
            two voices, and whether real vocal input segments cleanly across
            different rooms and mics.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
