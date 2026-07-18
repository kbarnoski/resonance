"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ChoirEngine, type Articulation } from "./audio";
import {
  centsOff,
  detectPitchYin,
  freqToMidi,
  midiToName,
} from "./pitch";
import {
  harmonize,
  keyName,
  snapToScale,
  type HarmonyEvent,
  type Mode,
  type Voicing,
} from "./harmony";
import { README } from "./readme-text";

// --- illuminated-manuscript palette (ART strings only, used inside SVG) ------
const GOLD = "#d9a441";
const GOLD_BRIGHT = "#f4d27a";
const GOLD_DEEP = "#a9781f";
const CREAM = "#efe3c2";
const OCHRE = "#b5842d";
const VELLUM_HI = "#2a1e0d";
const VELLUM_LO = "#160f05";
const RULE = "#6b4f21";

type Phase = "idle" | "live" | "fallback";

const SCORE_W = 1000;
const SCORE_H = 340;
const TIMELINE_MS = 9000;

// Per-voice lane layout (top -> bottom) and pitch->y mapping range.
const LANES: Array<{ key: keyof Voicing; label: string; min: number; max: number }> = [
  { key: "s", label: "Soprano", min: 55, max: 84 },
  { key: "a", label: "Alto", min: 50, max: 74 },
  { key: "t", label: "Tenor", min: 43, max: 67 },
  { key: "b", label: "Bass", min: 34, max: 62 },
];
const LANE_H = 74;
const LANE_GAP = 8;
const LANE_TOP = 20;

function laneY(laneIdx: number, midi: number): number {
  const lane = LANES[laneIdx];
  const top = LANE_TOP + laneIdx * (LANE_H + LANE_GAP);
  const frac = Math.max(0, Math.min(1, (midi - lane.min) / (lane.max - lane.min)));
  return top + LANE_H * (1 - frac) * 0.86 + LANE_H * 0.07;
}

interface RenderEvent {
  voicing: Voicing;
  time: number;
  roman: string;
}

interface Snap {
  singFreq: number;
  singName: string;
  singCents: number;
  level: number;
  roman: string;
  keyLabel: string;
  voicing: Voicing | null;
  env: { s: number; a: number; t: number; b: number };
  events: RenderEvent[];
  now: number;
}

// Ode to Joy — a recognizable, functional major melody for the mic-less demo.
const DEMO_OFFSETS = [4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 4, 2, 2];
const DEMO_STEP_MS = 560;

export default function ChoralisPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tonicPc, setTonicPc] = useState(0);
  const [mode, setMode] = useState<Mode>("major");
  const [wander, setWander] = useState(true);
  const [articulation, setArticulation] = useState<Articulation>("legato");
  const [snap, setSnap] = useState<Snap | null>(null);

  // Refs mirrored from state so the rAF loop reads current values.
  const phaseRef = useRef<Phase>("idle");
  const tonicRef = useRef(tonicPc);
  const modeRef = useRef<Mode>(mode);
  const wanderRef = useRef(wander);

  const engineRef = useRef<ChoirEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef(0);

  // Harmony pipeline state.
  const prevEventRef = useRef<HarmonyEvent | null>(null);
  const phrasePosRef = useRef(0);
  const eventsRef = useRef<HarmonyEvent[]>([]);
  const committedMidiRef = useRef(-1);
  const committedSinceRef = useRef(0);
  const candMidiRef = useRef(-1);
  const candSinceRef = useRef(0);
  const lastDetectRef = useRef(0);
  const lastTickRef = useRef(0);
  const levelRef = useRef(0);
  const singFreqRef = useRef(-1);
  const demoIdxRef = useRef(0);
  const demoNextRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    tonicRef.current = tonicPc;
  }, [tonicPc]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    wanderRef.current = wander;
  }, [wander]);
  useEffect(() => {
    if (engineRef.current) engineRef.current.articulation = articulation;
  }, [articulation]);

  // Commit a new soprano note: snap, harmonize, voice the machine parts, sound
  // them, and record the event for the breathing score.
  const commitNote = useCallback((rawMidi: number) => {
    const tonic = tonicRef.current;
    const md = modeRef.current;
    const soprano = snapToScale(rawMidi, tonic, md);
    const result = harmonize({
      soprano,
      tonicPc: tonic,
      mode: md,
      prev: prevEventRef.current,
      phrasePos: phrasePosRef.current,
    });
    const now = performance.now();
    const event: HarmonyEvent = {
      chord: result.chord,
      voicing: result.voicing,
      tonicPc: tonic,
      mode: md,
      time: now,
    };
    prevEventRef.current = event;
    eventsRef.current.push(event);
    if (eventsRef.current.length > 40) eventsRef.current.shift();
    committedMidiRef.current = soprano;
    committedSinceRef.current = now;
    phrasePosRef.current = (phrasePosRef.current + 1) % 8;

    const engine = engineRef.current;
    if (engine) {
      engine.setChord(result.voicing, ["s", "a", "t", "b"]);
    }

    // Optional modulation at a strong authentic cadence.
    if (result.isCadence && wanderRef.current && Math.random() < 0.35) {
      const step = Math.random() < 0.6 ? 7 : 5;
      tonicRef.current = (tonic + step) % 12;
      setTonicPc(tonicRef.current);
    }
  }, []);

  const frame = useCallback(() => {
    const now = performance.now();
    const ph = phaseRef.current;

    if (ph === "live") {
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      if (analyser && buf) {
        if (now - lastDetectRef.current > 45) {
          lastDetectRef.current = now;
          analyser.getFloatTimeDomainData(
            buf as unknown as Float32Array<ArrayBuffer>
          );
          const res = detectPitchYin(buf, analyser.context.sampleRate);
          levelRef.current = Math.min(1, res.rms * 6);
          if (res.freq > 0 && res.clarity > 0.5) {
            singFreqRef.current = res.freq;
            const midi = freqToMidi(res.freq);
            const snapped = snapToScale(midi, tonicRef.current, modeRef.current);
            if (snapped !== committedMidiRef.current) {
              if (snapped === candMidiRef.current) {
                if (now - candSinceRef.current > 90) commitNote(snapped);
              } else {
                candMidiRef.current = snapped;
                candSinceRef.current = now;
              }
            } else if (now - committedSinceRef.current > 1600) {
              // Sustained note: let the phrase breathe & advance the cadence.
              commitNote(snapped);
            }
          } else {
            singFreqRef.current = -1;
            if (res.rms < 0.006) {
              // True silence: let the choir fade.
              if (committedMidiRef.current !== -1 && now - committedSinceRef.current > 700) {
                engineRef.current?.hush();
                committedMidiRef.current = -1;
              }
            }
          }
        }
      }
    } else if (ph === "fallback") {
      levelRef.current = 0.4 + 0.2 * Math.sin(now / 300);
      if (now >= demoNextRef.current) {
        demoNextRef.current = now + DEMO_STEP_MS;
        const off = DEMO_OFFSETS[demoIdxRef.current % DEMO_OFFSETS.length];
        demoIdxRef.current += 1;
        const rawMidi = 60 + tonicRef.current + off;
        singFreqRef.current = 440 * Math.pow(2, (rawMidi - 69) / 12);
        commitNote(rawMidi);
      }
    }

    // Throttled snapshot for React render (~30fps).
    if (now - lastTickRef.current > 33) {
      lastTickRef.current = now;
      const engine = engineRef.current;
      const cur = prevEventRef.current;
      const f = singFreqRef.current;
      const sEnv =
        ph === "live"
          ? Math.min(1, levelRef.current * 1.4)
          : engine?.envelope("s") ?? 0;
      setSnap({
        singFreq: f,
        singName: f > 0 ? midiToName(freqToMidi(f)) : "—",
        singCents: f > 0 ? centsOff(f) : 0,
        level: levelRef.current,
        roman: cur ? cur.chord.roman : "—",
        keyLabel: keyName(tonicRef.current, modeRef.current),
        voicing: cur ? cur.voicing : null,
        env: {
          s: sEnv,
          a: engine?.envelope("a") ?? 0,
          t: engine?.envelope("t") ?? 0,
          b: engine?.envelope("b") ?? 0,
        },
        events: eventsRef.current.map((e) => ({
          voicing: e.voicing,
          time: e.time,
          roman: e.chord.roman,
        })),
        now,
      });
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [commitNote]);

  const resetPipeline = useCallback(() => {
    prevEventRef.current = null;
    phrasePosRef.current = 0;
    eventsRef.current = [];
    committedMidiRef.current = -1;
    candMidiRef.current = -1;
    singFreqRef.current = -1;
    demoIdxRef.current = 0;
    demoNextRef.current = 0;
  }, []);

  const startDemo = useCallback(() => {
    resetPipeline();
    const engine = new ChoirEngine(true);
    engine.articulation = articulation;
    engineRef.current = engine;
    void engine.resume();
    demoNextRef.current = performance.now();
    phaseRef.current = "fallback";
    setPhase("fallback");
    rafRef.current = requestAnimationFrame(frame);
  }, [articulation, frame, resetPipeline]);

  const startLive = useCallback(async () => {
    setError(null);
    resetPipeline();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const engine = new ChoirEngine(false);
      engine.articulation = articulation;
      engineRef.current = engine;
      await engine.resume();
      const ctx = engine.audioContext;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // analysis only — not routed to output
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      phaseRef.current = "live";
      setPhase("live");
      rafRef.current = requestAnimationFrame(frame);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? `Microphone unavailable (${e.message}). Showing the built-in demo instead.`
          : "Microphone unavailable. Showing the built-in demo instead."
      );
      startDemo();
    }
  }, [articulation, frame, resetPipeline, startDemo]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    engineRef.current?.dispose();
    engineRef.current = null;
    phaseRef.current = "idle";
    setPhase("idle");
    setSnap(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const running = phase !== "idle";

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 1928 · choralis
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Choralis — sing one line, hear four parts
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Sing or hum a bare melody. Choralis tracks your pitch with a YIN
          detector, snaps it to the key, and builds a real four-part chorale
          underneath — functional harmony with genuine voice-leading, not a
          pentatonic wash.
        </p>
      </header>

      {!running && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={startLive}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start singing
          </button>
          <button
            onClick={startDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Play a demo (no mic)
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {running && (
        <>
          <BreathingScore snap={snap} />

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Readout label="You're singing" value={snap?.singName ?? "—"}>
              {snap && snap.singFreq > 0 ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {snap.singFreq.toFixed(1)} Hz · {snap.singCents >= 0 ? "+" : ""}
                  {snap.singCents}¢
                </span>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">
                  {phase === "fallback" ? "demo phrase" : "listening…"}
                </span>
              )}
            </Readout>
            <Readout label="Chord" value={snap?.roman ?? "—"}>
              <span className="font-mono text-xs text-muted-foreground">
                {snap?.keyLabel ?? ""}
              </span>
            </Readout>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Level
              </span>
              <div className="h-2 w-28 overflow-hidden rounded-full border border-border">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.round((snap?.level ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {phase === "fallback" && (
            <p className="text-sm text-muted-foreground">
              Fallback demo — a built-in melody driving the same harmonizer. Stop
              and press{" "}
              <span className="text-foreground">Start singing</span> to use your
              own voice.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Key
              <select
                value={tonicPc}
                onChange={(e) => setTonicPc(Number(e.target.value))}
                className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map(
                  (n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  )
                )}
              </select>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </label>

            <button
              onClick={() =>
                setArticulation((a) => (a === "legato" ? "detached" : "legato"))
              }
              className="min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {articulation === "legato" ? "Legato" : "Detached"}
            </button>

            <button
              onClick={() => setWander((w) => !w)}
              className="min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {wander ? "Key wander: on" : "Key wander: off"}
            </button>

            <button
              onClick={stop}
              className="min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-16 right-4 z-30 min-h-[36px] rounded-md border border-border bg-background/80 px-3 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1928-choralis"]} />
    </main>
  );
}

function Readout({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </span>
      {children}
    </div>
  );
}

function BreathingScore({ snap }: { snap: Snap | null }) {
  const now = snap?.now ?? performance.now();
  const events = snap?.events ?? [];
  const env = snap?.env ?? { s: 0, a: 0, t: 0, b: 0 };
  const voicing = snap?.voicing ?? null;

  const xFor = (t: number) => SCORE_W * (1 - (now - t) / TIMELINE_MS);

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-border"
      style={{ boxShadow: "0 0 60px rgba(217,164,65,0.14)" }}
    >
      <svg
        viewBox={`0 0 ${SCORE_W} ${SCORE_H}`}
        className="block w-full"
        style={{ background: `linear-gradient(160deg, ${VELLUM_HI}, ${VELLUM_LO})` }}
        aria-label="Four-part breathing score"
      >
        <defs>
          <filter id="goldGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="goldStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={GOLD_DEEP} stopOpacity="0.15" />
            <stop offset="0.7" stopColor={GOLD} stopOpacity="0.9" />
            <stop offset="1" stopColor={GOLD_BRIGHT} />
          </linearGradient>
        </defs>

        {/* Lanes */}
        {LANES.map((lane, i) => {
          const top = LANE_TOP + i * (LANE_H + LANE_GAP);
          const activity = env[lane.key];
          return (
            <g key={lane.key}>
              <rect
                x={0}
                y={top}
                width={SCORE_W}
                height={LANE_H}
                fill={GOLD}
                opacity={0.03 + activity * 0.09}
              />
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={SCORE_W}
                  y1={top + LANE_H * f}
                  y2={top + LANE_H * f}
                  stroke={RULE}
                  strokeWidth={0.5}
                  opacity={0.35}
                />
              ))}
              <text
                x={14}
                y={top + 16}
                fill={CREAM}
                opacity={0.55}
                fontSize={11}
                fontFamily="ui-monospace, monospace"
                letterSpacing="2"
              >
                {lane.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Voice ribbons + note blobs */}
        {LANES.map((lane, li) => {
          const pts = events
            .map((ev) => ({ x: xFor(ev.time), y: laneY(li, ev.voicing[lane.key]) }))
            .filter((p) => p.x > -30 && p.x < SCORE_W + 30);
          const activity = env[lane.key];
          const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          return (
            <g key={`v-${lane.key}`}>
              {pts.length > 1 && (
                <polyline
                  points={poly}
                  fill="none"
                  stroke="url(#goldStroke)"
                  strokeWidth={1.5 + activity * 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.65 + activity * 0.35}
                  filter="url(#goldGlow)"
                />
              )}
              {pts.map((p, pi) => {
                const recency = pi / Math.max(1, pts.length - 1);
                return (
                  <circle
                    key={pi}
                    cx={p.x}
                    cy={p.y}
                    r={2 + recency * 3}
                    fill={recency > 0.85 ? GOLD_BRIGHT : GOLD}
                    opacity={0.35 + recency * 0.6}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Playhead + current pitch markers */}
        <line
          x1={SCORE_W - 2}
          x2={SCORE_W - 2}
          y1={LANE_TOP}
          y2={SCORE_H - 6}
          stroke={OCHRE}
          strokeWidth={1}
          opacity={0.5}
        />
        {voicing &&
          LANES.map((lane, li) => {
            const activity = env[lane.key];
            if (activity <= 0.01) return null;
            return (
              <circle
                key={`head-${lane.key}`}
                cx={SCORE_W - 8}
                cy={laneY(li, voicing[lane.key])}
                r={4 + activity * 4}
                fill={GOLD_BRIGHT}
                opacity={0.4 + activity * 0.6}
                filter="url(#goldGlow)"
              />
            );
          })}

        {/* Illuminated chord label */}
        {snap && (
          <text
            x={SCORE_W - 20}
            y={SCORE_H - 14}
            textAnchor="end"
            fill={GOLD_BRIGHT}
            opacity={0.9}
            fontSize={34}
            fontWeight={700}
            fontFamily="Georgia, 'Times New Roman', serif"
            filter="url(#goldGlow)"
          >
            {snap.roman}
          </text>
        )}
        {/* Illuminated initial */}
        <text
          x={22}
          y={SCORE_H - 22}
          fill={GOLD_DEEP}
          opacity={0.5}
          fontSize={78}
          fontWeight={700}
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          C
        </text>
      </svg>
    </div>
  );
}
