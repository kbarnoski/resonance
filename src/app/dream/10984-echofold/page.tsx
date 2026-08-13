"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10984 · Echofold — sing a phrase to a living mind; hear it dream it back.
//
//   ONE QUESTION
//   What if you played a short phrase to a real echo-state reservoir — a living
//   little mind — and it dreamed the phrase back to you, transformed a little
//   more each time, so your melody and its memory of your melody slowly drift
//   apart and never quite return?
//
//   A genuine Echo-State Network (Jaeger 2001) runs in the background: state
//   x ∈ R^N under a sparse random recurrent matrix rescaled to spectral radius
//   ρ, driven by your traced phrase, read out by FIXED random projections. Its
//   fading-memory / echo-state property IS the concept — the reservoir holds a
//   decaying, mutating trace of your gesture and sings it back, drifting under
//   its own light output-feedback. Different at minute 5 than at minute 1.
//
//   The loom is inline SVG (never canvas/WebGL): a two-staff scrolling score —
//   your phrase up top, the reservoir's dreamed-back echo below, threads
//   connecting them that stretch and fray as the two melodies diverge.
//
//   Frontier: 2026 edge-of-chaos reservoir design (arXiv:2605.26848). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Reservoir } from "./esn";
import {
  EchofoldAudio,
  degreeToInputFreq,
  degreeToEchoFreq,
  pitchToDegree,
  DEGREES,
} from "./audio";

// ── Engine constants ──────────────────────────────────────────────────────────
const N = 220;
const DENSITY = 0.15;
const N_READOUTS = 6;
const SEED = 10984;
const STEP_DT = 1 / 22; // reservoir step interval (seconds)
const WINDOW_MS = 9000; // visible score span
const MAX_MARKS = 60;

type Mark = { id: number; t: number; deg: number; ch: number; vel: number };

// A seeded starter phrase (whole-tone contour) so the loom is alive on mount.
function makeSeedPhrase(): { events: { t: number; deg: number }[]; length: number } {
  const degs = [7, 9, 8, 11, 8, 6, 9, 7, 4, 7];
  const events = degs.map((deg, i) => ({ t: i * 360, deg }));
  return { events, length: degs.length * 360 + 900 };
}

export default function EchofoldPage() {
  const [soundOn, setSoundOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  // Slider state (mirrored into refs the RAF loop reads).
  const [rho, setRho] = useState(0.97);
  const [inputGain, setInputGain] = useState(1.0);
  const [leak, setLeak] = useState(0.32);

  // Live HUD readout.
  const [hud, setHud] = useState({ mem: 0, energy: 0, notes: 0 });

  // Bump to force a re-render each throttled frame; `nowRef` holds the clock.
  const [, setTick] = useState(0);

  // ── Engine refs (never React state) ──────────────────────────────────────────
  const reservoirRef = useRef<Reservoir | null>(null);
  const audioRef = useRef<EchofoldAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const nowRef = useRef(0);
  const inputMarksRef = useRef<Mark[]>([]);
  const echoMarksRef = useRef<Mark[]>([]);
  const idRef = useRef(1);
  const noteCountRef = useRef(0);

  const phraseRef = useRef(makeSeedPhrase());
  const loopStartRef = useRef(0);
  const lastPhaseRef = useRef(0);
  const pendingRef = useRef({ impulse: 0, deg: 6 });

  const recordingRef = useRef(false);
  const recordBufRef = useRef<{ t: number; deg: number }[]>([]);
  const recordStartRef = useRef(0);
  const lastSampleRef = useRef(0);
  const laneRef = useRef<SVGRectElement | null>(null);
  const reducedMotionRef = useRef(false);

  // ── Fire one input onset: audio + top-lane mark + reservoir drive ────────────
  const fireInput = useCallback((now: number, deg: number, vel: number) => {
    pendingRef.current = { impulse: 1, deg };
    const marks = inputMarksRef.current;
    marks.push({ id: idRef.current++, t: now, deg, ch: -1, vel });
    if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS);
    audioRef.current?.playInput(degreeToInputFreq(deg), vel);
  }, []);

  // ── Main animation + engine loop ──────────────────────────────────────────────
  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reservoir = new Reservoir({
      N,
      density: DENSITY,
      nReadouts: N_READOUTS,
      seed: SEED,
    });
    reservoir.rho = rho;
    reservoir.leak = leak;
    reservoir.inputGain = inputGain;
    reservoirRef.current = reservoir;

    audioRef.current = new EchofoldAudio();

    const start = performance.now();
    loopStartRef.current = start;
    lastPhaseRef.current = 0;
    let last = start;
    let acc = 0;
    let lastRender = 0;
    let lastHud = 0;
    const renderInterval = reducedMotionRef.current ? 180 : 33;

    const loop = () => {
      const nowMs = performance.now();
      nowRef.current = nowMs;
      const res = reservoirRef.current;
      if (!res) return;

      // 1. Phrase playback: fire input onsets as the loop phase passes them.
      const phrase = phraseRef.current;
      if (phrase.events.length > 0 && !recordingRef.current) {
        const phase = (nowMs - loopStartRef.current) % phrase.length;
        const prev = lastPhaseRef.current;
        for (const ev of phrase.events) {
          const crossed = prev <= phase ? ev.t > prev && ev.t <= phase : ev.t > prev || ev.t <= phase;
          if (crossed) fireInput(nowMs, ev.deg, 0.85);
        }
        lastPhaseRef.current = phase;
      }

      // 2. Reservoir steps at a fixed timestep (accumulator).
      acc += (nowMs - last) / 1000;
      last = nowMs;
      let steps = 0;
      while (acc >= STEP_DT && steps < 6) {
        acc -= STEP_DT;
        steps++;
        const p = pendingRef.current;
        const events = res.step(p.impulse, (p.deg / (DEGREES - 1)) * 2 - 1);
        p.impulse *= 0.42; // decay the onset kick between steps
        for (const e of events) {
          const deg = pitchToDegree(e.pitch);
          const marks = echoMarksRef.current;
          marks.push({ id: idRef.current++, t: nowMs, deg, ch: e.channel, vel: e.vel });
          if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS);
          audioRef.current?.playEcho(degreeToEchoFreq(deg), e.vel, e.channel);
          noteCountRef.current++;
        }
      }

      // 3. Prune off-screen marks.
      const cutoff = nowMs - WINDOW_MS - 400;
      inputMarksRef.current = inputMarksRef.current.filter((m) => m.t >= cutoff);
      echoMarksRef.current = echoMarksRef.current.filter((m) => m.t >= cutoff);

      // 4. Throttled visual + HUD updates.
      if (nowMs - lastRender >= renderInterval) {
        lastRender = nowMs;
        setTick((t) => (t + 1) & 0xffff);
      }
      if (nowMs - lastHud >= 250) {
        lastHud = nowMs;
        setHud({
          mem: res.memorySeconds(STEP_DT),
          energy: res.energy(),
          notes: noteCountRef.current,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      reservoirRef.current = null;
    };
    // Engine builds once; live params flow through refs via the slider effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireInput]);

  // Keep the reservoir's live knobs in sync with the sliders.
  useEffect(() => {
    if (reservoirRef.current) reservoirRef.current.rho = rho;
  }, [rho]);
  useEffect(() => {
    if (reservoirRef.current) reservoirRef.current.inputGain = inputGain;
  }, [inputGain]);
  useEffect(() => {
    if (reservoirRef.current) reservoirRef.current.leak = leak;
  }, [leak]);

  // ── Sound toggle ──────────────────────────────────────────────────────────────
  const handleToggleSound = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!soundOn) {
      await audio.unlock();
      if (audio.failed || !audio.ready) {
        setAudioNote("Audio unavailable — the loom keeps dreaming in silence.");
        return;
      }
      audio.setMuted(false);
      setSoundOn(true);
      setAudioNote(null);
    } else {
      audio.setMuted(true);
      setSoundOn(false);
    }
  }, [soundOn]);

  // ── Recording a phrase on the top lane ────────────────────────────────────────
  const yToDegree = useCallback((clientY: number): number => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return 6;
    const t = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(t * (DEGREES - 1));
  }, []);

  const startRecording = useCallback(() => {
    recordBufRef.current = [];
    recordStartRef.current = performance.now();
    lastSampleRef.current = 0;
    recordingRef.current = true;
    setRecording(true);
    inputMarksRef.current = [];
  }, []);

  const finishRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    const buf = recordBufRef.current;
    if (buf.length >= 2) {
      const length = Math.max(2000, buf[buf.length - 1].t + 900);
      phraseRef.current = { events: buf, length };
      loopStartRef.current = performance.now();
      lastPhaseRef.current = 0;
      reservoirRef.current?.reset();
      echoMarksRef.current = [];
      noteCountRef.current = 0;
    }
  }, []);

  const sampleGesture = useCallback(
    (clientY: number) => {
      const now = performance.now();
      if (now - lastSampleRef.current < 130) return;
      lastSampleRef.current = now;
      const deg = yToDegree(clientY);
      recordBufRef.current.push({ t: now - recordStartRef.current, deg });
      fireInput(now, deg, 0.85);
    },
    [yToDegree, fireInput]
  );

  const onLanePointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!recordingRef.current) startRecording();
      (e.target as SVGRectElement).setPointerCapture?.(e.pointerId);
      sampleGesture(e.clientY);
    },
    [startRecording, sampleGesture]
  );

  const onLanePointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (recordingRef.current) sampleGesture(e.clientY);
    },
    [sampleGesture]
  );

  const onLanePointerUp = useCallback(() => finishRecording(), [finishRecording]);

  const handleClear = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    phraseRef.current = makeSeedPhrase();
    loopStartRef.current = performance.now();
    lastPhaseRef.current = 0;
    inputMarksRef.current = [];
    echoMarksRef.current = [];
    noteCountRef.current = 0;
    reservoirRef.current?.reset();
  }, []);

  // ── Geometry ──────────────────────────────────────────────────────────────────
  const VB_W = 1000;
  const VB_H = 440;
  const RIGHT = 940;
  const LEFT = 60;
  const SPAN = RIGHT - LEFT;
  const TOP_Y = 120;
  const BOT_Y = 320;
  const LANE_H = 150;

  const now = nowRef.current || performance.now();
  const xAt = (t: number) => RIGHT - ((now - t) / WINDOW_MS) * SPAN;
  const yAt = (deg: number, center: number) =>
    center - ((deg / (DEGREES - 1)) - 0.5) * LANE_H;
  const opacityAt = (t: number) => {
    const age = (now - t) / WINDOW_MS;
    return Math.max(0, Math.min(1, 1.15 - age * 1.15));
  };

  const inputMarks = inputMarksRef.current;
  const echoMarks = echoMarksRef.current;
  const noTransition = reducedMotionRef.current;

  // Pair each echo with the nearest preceding input mark (its remembered source).
  const threads = echoMarks.map((em) => {
    let src: Mark | null = null;
    for (let i = inputMarks.length - 1; i >= 0; i--) {
      const im = inputMarks[i];
      if (im.t <= em.t && em.t - im.t <= 3200) {
        src = im;
        break;
      }
    }
    return { em, src };
  });

  const memPct = Math.min(1, hud.mem / 6);

  return (
    <div className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            10984 · Echofold
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Sing a phrase to a living mind and hear it dream you back
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            A real echo-state reservoir holds a fading trace of your melody and sings it
            back, transformed a little more each pass — your line and its memory of your
            line drifting apart, never quite returning.
          </p>
        </header>

        {/* ── Controls ─────────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleToggleSound}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {soundOn ? "Mute" : "Unlock sound"}
          </button>
          <button
            onClick={recording ? finishRecording : startRecording}
            className={`min-h-[44px] rounded-md border px-4 text-sm ${
              recording
                ? "border-primary bg-primary/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {recording ? "Finish phrase" : "Sing a phrase"}
          </button>
          <button
            onClick={handleClear}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            state: dreaming · pole: fading-memory
          </span>
        </div>

        {recording && (
          <p className="mb-3 text-base text-primary">
            Trace a contour on the upper lane — up for higher, down for lower.
          </p>
        )}
        {audioNote && <p className="mb-3 text-base text-destructive">{audioNote}</p>}

        {/* ── The memory loom ──────────────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-lg border border-border bg-[#05060a]">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="block w-full"
            style={{ minWidth: 640 }}
            role="img"
            aria-label="A scrolling two-staff score: your phrase above, the reservoir's echo below, threads fraying as they drift."
          >
            <defs>
              <radialGradient id="ef-aura" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.28" />
                <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#05060a" stopOpacity="0" />
              </radialGradient>
              <filter id="ef-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="ef-thread" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#2dd4bf" />
              </linearGradient>
            </defs>

            {/* reservoir energy aura */}
            <ellipse
              cx={VB_W / 2}
              cy={VB_H / 2}
              rx={VB_W * 0.42}
              ry={140 + Math.min(120, hud.energy * 260)}
              fill="url(#ef-aura)"
              opacity={0.5 + Math.min(0.5, hud.energy * 1.2)}
            />

            {/* lane baselines */}
            <line x1={LEFT} y1={TOP_Y} x2={RIGHT} y2={TOP_Y} stroke="#1b2436" strokeWidth={1} />
            <line x1={LEFT} y1={BOT_Y} x2={RIGHT} y2={BOT_Y} stroke="#1b2436" strokeWidth={1} />
            <text x={LEFT} y={TOP_Y - LANE_H / 2 - 12} fill="#7c8db0" fontSize={12} fontFamily="monospace" letterSpacing={2}>
              YOUR PHRASE
            </text>
            <text x={LEFT} y={BOT_Y + LANE_H / 2 + 22} fill="#5fb8c4" fontSize={12} fontFamily="monospace" letterSpacing={2}>
              ITS MEMORY OF YOU
            </text>

            {/* playhead */}
            <line x1={RIGHT} y1={40} x2={RIGHT} y2={VB_H - 40} stroke="#3a2f66" strokeWidth={1.5} strokeDasharray="3 5" />

            {/* threads: memory connecting your marks to the dreamed echo */}
            <g>
              {threads.map(({ em, src }) => {
                if (!src) return null;
                const x1 = xAt(src.t);
                const y1 = yAt(src.deg, TOP_Y);
                const x2 = xAt(em.t);
                const y2 = yAt(em.deg, BOT_Y);
                const drift = Math.abs(em.deg - src.deg) / (DEGREES - 1);
                const op = opacityAt(em.t) * (0.55 - drift * 0.4);
                if (op <= 0.02) return null;
                const dash = drift < 0.04 ? undefined : `${2 + drift * 2} ${2 + drift * 12}`;
                const midX = (x1 + x2) / 2 + drift * 40;
                return (
                  <path
                    key={`th-${em.id}`}
                    d={`M ${x1} ${y1} Q ${midX} ${(y1 + y2) / 2} ${x2} ${y2}`}
                    fill="none"
                    stroke="url(#ef-thread)"
                    strokeWidth={1.1}
                    strokeOpacity={Math.max(0, op)}
                    strokeDasharray={dash}
                    style={noTransition ? undefined : { transition: "stroke-opacity 0.25s linear" }}
                  />
                );
              })}
            </g>

            {/* input marks (you) — luminous violet circles */}
            <g filter="url(#ef-glow)">
              {inputMarks.map((m) => {
                const x = xAt(m.t);
                const op = opacityAt(m.t);
                if (op <= 0.02) return null;
                return (
                  <circle
                    key={`in-${m.id}`}
                    cx={x}
                    cy={yAt(m.deg, TOP_Y)}
                    r={3.4 + m.vel * 2.4}
                    fill="#c4b5fd"
                    opacity={op}
                  />
                );
              })}
            </g>

            {/* echo marks (its memory) — cool teal diamonds */}
            <g filter="url(#ef-glow)">
              {echoMarks.map((m) => {
                const x = xAt(m.t);
                const op = opacityAt(m.t);
                if (op <= 0.02) return null;
                const y = yAt(m.deg, BOT_Y);
                const s = 3.2 + m.vel * 2.6;
                return (
                  <rect
                    key={`ec-${m.id}`}
                    x={x - s}
                    y={y - s}
                    width={s * 2}
                    height={s * 2}
                    transform={`rotate(45 ${x} ${y})`}
                    fill={m.ch === 0 ? "#2dd4bf" : "#38bdf8"}
                    opacity={op}
                  />
                );
              })}
            </g>

            {/* invisible capture surface for tracing a phrase on the top lane */}
            <rect
              ref={laneRef}
              x={LEFT}
              y={TOP_Y - LANE_H / 2 - 10}
              width={SPAN}
              height={LANE_H + 20}
              fill="transparent"
              style={{ cursor: recording ? "crosshair" : "pointer", touchAction: "none" }}
              onPointerDown={onLanePointerDown}
              onPointerMove={onLanePointerMove}
              onPointerUp={onLanePointerUp}
              onPointerCancel={onLanePointerUp}
            />
          </svg>
        </div>

        {/* ── Sliders + HUD ────────────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SliderRow
            label="Spectral radius ρ"
            value={rho}
            min={0.8}
            max={1.05}
            step={0.005}
            onChange={setRho}
            hint={`memory ≈ ${hud.mem >= 999 ? "∞" : hud.mem.toFixed(1) + "s"}`}
          />
          <SliderRow
            label="Input coupling"
            value={inputGain}
            min={0.2}
            max={2.0}
            step={0.02}
            onChange={setInputGain}
            hint="how strongly you drive it"
          />
          <SliderRow
            label="Leak α"
            value={leak}
            min={0.08}
            max={0.7}
            step={0.01}
            onChange={setLeak}
            hint="crisp ↔ dissolving"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-muted-foreground">
          <span>
            ρ <span className="text-primary">{rho.toFixed(3)}</span>
          </span>
          <span>
            memory{" "}
            <span className="text-primary">{hud.mem >= 999 ? "∞" : hud.mem.toFixed(2) + "s"}</span>
          </span>
          <span>
            energy <span className="text-primary">{hud.energy.toFixed(3)}</span>
          </span>
          <span>
            dreamed notes <span className="text-primary">{hud.notes}</span>
          </span>
          <span className="flex items-center gap-2">
            drift
            <span className="inline-block h-1.5 w-24 overflow-hidden rounded-md bg-border align-middle">
              <span
                className="block h-full bg-primary"
                style={{ width: `${memPct * 100}%` }}
              />
            </span>
          </span>
        </div>

        <p className="mt-6 max-w-2xl text-base text-muted-foreground">
          Press <span className="text-foreground">Unlock sound</span>, then{" "}
          <span className="text-foreground">Sing a phrase</span> and trace a contour on the
          upper lane. Push ρ toward 1.0 for a long, dissolving memory that drifts far from
          your line; pull it back for a crisp, faithful echo.
        </p>
      </div>

      {/* ── Design-notes modal ───────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              The technique — real, not faked
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                A genuine <span className="text-foreground">echo-state network</span> (Jaeger,
                2001) runs live: a state vector x ∈ R<sup>{N}</sup> under a sparse random
                recurrent matrix W (density {Math.round(DENSITY * 100)}%), rescaled to
                spectral radius ρ by power iteration. The leaky update is{" "}
                <span className="font-mono text-xs">x ← (1−α)x + α·tanh(Wx + Wᵢₙu + Wfb·z)</span>.
              </p>
              <p>
                Six <span className="text-foreground">fixed random linear readouts</span> Wout·x
                are the sung-back voices — no training. Onsets fire on upward
                threshold-crossings, so the melody is the reservoir&apos;s own dynamics, not a
                sequencer.
              </p>
              <p>
                Its <span className="text-foreground">fading-memory / echo-state property</span>{" "}
                is the whole point: x holds a decaying, nonlinearly-mixed trace of your recent
                gesture, and a light output-feedback term keeps it dreaming so the echo drifts —
                different at minute 5 than minute 1.
              </p>
              <p>
                <span className="text-foreground">Sliders:</span> ρ sets how long the memory
                lasts and how wild the transformation (edge-of-chaos near 1.0); input coupling
                scales how hard you drive it; leak α trades crisp echoes for dissolving smears —
                the three control axes of 2026 edge-of-chaos reservoir design
                (arXiv:2605.26848).
              </p>
              <p className="font-mono text-xs">state: dreaming · pole: fading-memory</p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────
function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {props.label}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        className="mt-2 block w-full accent-primary"
      />
      <span className="mt-1 block text-sm text-muted-foreground">
        <span className="text-foreground">{props.value.toFixed(props.step < 0.01 ? 3 : 2)}</span>{" "}
        · {props.hint}
      </span>
    </label>
  );
}
