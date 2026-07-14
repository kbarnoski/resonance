"use client";

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  ACC_KEYS,
  composeFugue,
  type Composition,
  DEFAULT_SUBJECT,
  KEY_MAP,
  KEY_ORDER,
  midiName,
  staffInfo,
} from "./engine";

// Deterministic seed for every composition (headless-reproducible ghost demo).
const COMPOSE_SEED = 5;
const GRACE_MS = 3000;

// ---- Transport --------------------------------------------------------------
const MEASURE = 1.7; // seconds per bar
const BEAT = MEASURE / 2;
const TAIL = 1.2; // let the final chord ring before we stop

// ---- SVG geometry -----------------------------------------------------------
const LEFT = 96;
const BAR_W = 92;
const RIGHT = 32;
const HALF = 6; // px per diatonic step
type Band = { mid: number; ref: number; top: number };
const BANDS: Record<"upper" | "cf" | "bass", Band> = {
  upper: { mid: 68, ref: 76, top: 44 },
  cf: { mid: 176, ref: 69, top: 152 },
  bass: { mid: 284, ref: 55, top: 260 },
};
const SVG_H = 344;

function yFor(midi: number, band: Band): number {
  return band.mid - (staffInfo(midi).step - staffInfo(band.ref).step) * HALF;
}

// ---- Art palette (SVG-only; NOT UI chrome) ---------------------------------
const INK = "#241a10";
const INK_SOFT = "#4a3a26";
const STAFF = "#c1b090";
const LABEL = "#8a7550";
const SECTION = "#a08a5f";
const PLAYHEAD = "#a8863f";
const VETO = "#b23a2e";

type SchedNote = {
  voice: 0 | 1 | 2;
  midi: number;
  start: number;
  dur: number;
  filled: boolean;
  passing: boolean;
  bar: number;
};

function buildSchedule(c: Composition): SchedNote[] {
  const out: SchedNote[] = [];
  for (let i = 0; i < c.bars; i++) {
    if (i >= c.cfEntry) {
      out.push({ voice: 1, midi: c.cf[i], start: i * MEASURE, dur: MEASURE, filled: false, passing: false, bar: i });
    }
    if (i >= c.upper.entry && c.upper.strong[i] !== null) {
      out.push({ voice: 0, midi: c.upper.strong[i]!, start: i * MEASURE, dur: MEASURE, filled: false, passing: false, bar: i });
    }
    if (i >= c.bass.entry && c.bass.strong[i] !== null) {
      const isCad = i >= c.bars - 2;
      if (isCad) {
        out.push({ voice: 2, midi: c.bass.strong[i]!, start: i * MEASURE, dur: MEASURE, filled: false, passing: false, bar: i });
      } else {
        out.push({ voice: 2, midi: c.bass.strong[i]!, start: i * MEASURE, dur: BEAT, filled: true, passing: false, bar: i });
        const w = c.bass.weak[i];
        if (w !== null) {
          out.push({ voice: 2, midi: w, start: i * MEASURE + BEAT, dur: BEAT, filled: true, passing: c.bass.passing[i], bar: i });
        }
      }
    }
  }
  return out;
}

// Notehead x within a bar depends on rhythmic role.
function noteX(bar: number, role: "whole" | "strong" | "weak"): number {
  const bx = LEFT + bar * BAR_W;
  if (role === "whole") return bx + BAR_W * 0.42;
  if (role === "strong") return bx + BAR_W * 0.26;
  return bx + BAR_W * 0.7;
}

export default function SpeciesLoom() {
  const [mode, setMode] = useState<"ghost" | "human">("ghost");
  const [subject, setSubject] = useState<number[]>([]);
  const [comp, setComp] = useState<Composition | null>(null);
  const [playing, setPlaying] = useState(false);
  const [nowSec, setNowSec] = useState(0);
  const [lastKey, setLastKey] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);

  // Audio graph refs.
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<{ osc: OscillatorNode[]; gains: AudioNode[] }>({ osc: [], gains: [] });
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const totalRef = useRef(0);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false); // has a ghost/human run begun?
  const compRef = useRef<Composition | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ---- Audio ---------------------------------------------------------------
  const ensureAudio = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.13;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
    return ctx;
  }, []);

  const stopAllNodes = useCallback(() => {
    const { osc, gains } = nodesRef.current;
    for (const o of osc) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      try {
        o.disconnect();
      } catch {
        /* noop */
      }
    }
    for (const g of gains) {
      try {
        g.disconnect();
      } catch {
        /* noop */
      }
    }
    nodesRef.current = { osc: [], gains: [] };
  }, []);

  // A short one-shot voice for a single note (both scheduled fugue notes and
  // the live key-preview go through this).
  const voice = useCallback((voiceIdx: 0 | 1 | 2, midi: number, at: number, dur: number, vel: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const pan = ctx.createStereoPanner();
    pan.pan.value = voiceIdx === 0 ? 0.32 : voiceIdx === 2 ? -0.32 : 0;
    pan.connect(master);
    const g = ctx.createGain();
    const a = 0.02;
    const rel = Math.min(0.14, dur * 0.4);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vel, at + a);
    g.gain.setValueAtTime(vel, at + Math.max(a, dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    g.connect(pan);
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = voiceIdx === 0 ? "triangle" : "sine";
    o2.frequency.value = freq;
    o2.detune.value = voiceIdx === 0 ? 6 : voiceIdx === 2 ? -4 : 3;
    const g2 = ctx.createGain();
    g2.gain.value = voiceIdx === 0 ? 0.5 : 0.35;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    o1.start(at);
    o2.start(at);
    o1.stop(at + dur + 0.02);
    o2.stop(at + dur + 0.02);
    nodesRef.current.osc.push(o1, o2);
    nodesRef.current.gains.push(g, g2, pan);
  }, []);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopAllNodes();
    setPlaying(false);
  }, [stopAllNodes]);

  const startPlayback = useCallback(
    (c: Composition) => {
      const ctx = ensureAudio();
      if (ctx.state === "suspended") void ctx.resume();
      stopAllNodes();
      cancelAnimationFrame(rafRef.current);
      const sched = buildSchedule(c);
      const t0 = ctx.currentTime + 0.15;
      t0Ref.current = t0;
      totalRef.current = c.bars * MEASURE;
      for (const s of sched) {
        const vel = s.voice === 1 ? 0.075 : s.voice === 0 ? 0.06 : 0.058;
        voice(s.voice, s.midi, t0 + s.start, s.dur * 0.98, vel);
      }
      setPlaying(true);
      // Drive the playhead from the rAF timestamp (not ctx.currentTime) so the
      // manuscript keeps writing even if the AudioContext is briefly suspended
      // by an autoplay policy — the unattended demo is never frozen.
      let visStart = -1;
      const loop = (ts: number) => {
        if (visStart < 0) visStart = ts;
        const el = (ts - visStart) / 1000;
        setNowSec(el);
        if (el >= totalRef.current + TAIL) {
          setPlaying(false);
          setNowSec(totalRef.current);
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    },
    [ensureAudio, stopAllNodes, voice],
  );

  const runCompose = useCallback(
    (subj: number[], autoplay: boolean) => {
      const c = composeFugue(subj, COMPOSE_SEED);
      compRef.current = c;
      setComp(c);
      setNowSec(0);
      if (autoplay) startPlayback(c);
    },
    [startPlayback],
  );

  // ---- Ghost auto-demo -----------------------------------------------------
  useEffect(() => {
    graceRef.current = setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      setMode("ghost");
      setSubject(DEFAULT_SUBJECT);
      runCompose(DEFAULT_SUBJECT, true);
    }, GRACE_MS);
    return () => {
      if (graceRef.current) clearTimeout(graceRef.current);
    };
  }, [runCompose]);

  // ---- Keyboard: play the subject -----------------------------------------
  const handleMusicKey = useCallback(
    (midi: number) => {
      startedRef.current = true;
      if (graceRef.current) clearTimeout(graceRef.current);
      const ctx = ensureAudio();
      if (ctx.state === "suspended") void ctx.resume();
      // A human just took over: leave ghost mode, stop any playback, start fresh.
      let next: number[];
      if (mode !== "human") {
        stopPlayback();
        setComp(null);
        compRef.current = null;
        setMode("human");
        next = [midi];
      } else {
        next = [...subject, midi];
      }
      setSubject(next.slice(0, 12));
      setLastKey(midi);
      // Live preview of the played note.
      voice(1, midi, ctx.currentTime + 0.01, 0.5, 0.08);
    },
    [ensureAudio, mode, stopPlayback, subject, voice],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k in KEY_MAP) {
        e.preventDefault();
        handleMusicKey(KEY_MAP[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMusicKey]);

  // ---- Teardown ------------------------------------------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (graceRef.current) clearTimeout(graceRef.current);
      stopAllNodes();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, [stopAllNodes]);

  // ---- Derived render data -------------------------------------------------
  const bars = comp ? comp.bars : Math.max(subject.length, 6);
  const svgW = LEFT + bars * BAR_W + RIGHT;
  const playheadX = LEFT + (nowSec / MEASURE) * BAR_W;
  const elapsed = nowSec;

  const clearAll = useCallback(() => {
    stopPlayback();
    setComp(null);
    compRef.current = null;
    setSubject([]);
    setMode("human");
    setNowSec(0);
    setLastKey(null);
    startedRef.current = true;
  }, [stopPlayback]);

  const loadGhostSubject = useCallback(() => {
    startedRef.current = true;
    if (graceRef.current) clearTimeout(graceRef.current);
    setMode("human");
    setSubject(DEFAULT_SUBJECT);
    runCompose(DEFAULT_SUBJECT, true);
  }, [runCompose]);

  const report = comp?.report;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Species Loom</h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            Play a short subject, then watch a machine grow it into a three-voice fugue whose every
            note is chosen to obey real species-counterpoint rules — illegal moves flash red and are
            rejected on the score in front of you.
          </p>
        </header>

        {/* Status badge */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
              mode === "ghost"
                ? "bg-primary/20 text-primary"
                : "border border-border bg-background/60 text-muted-foreground"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${mode === "ghost" ? "bg-primary" : "bg-muted-foreground"}`}
            />
            {mode === "ghost" ? "ghost is composing" : "you have the subject"}
          </span>
          {report && (
            <span className="inline-flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
              <span>verticals checked: {report.verticalsChecked}</span>
              <span className={report.violations === 0 ? "text-primary" : "text-destructive"}>
                violations: {report.violations}
              </span>
              <span>passing dissonances: {report.passingDissonances}</span>
              {report.relaxed && <span className="text-destructive">hidden-5th relaxed</span>}
            </span>
          )}
        </div>

        {/* Manuscript */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <svg
            width={svgW}
            height={SVG_H}
            viewBox={`0 0 ${svgW} ${SVG_H}`}
            role="img"
            aria-label="Self-writing counterpoint manuscript"
            style={{ display: "block", minWidth: "100%" }}
          >
            <defs>
              <linearGradient id="parch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f2e9d3" />
                <stop offset="1" stopColor="#e7dcbf" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={svgW} height={SVG_H} fill="url(#parch)" />

            <ManuscriptStaves bars={bars} />

            {/* Section labels */}
            {comp?.sections.map((s) => (
              <text
                key={`sec-${s.bar}-${s.text}`}
                x={LEFT + s.bar * BAR_W + 4}
                y={30}
                fontSize="11"
                fill={SECTION}
                fontFamily="ui-sans-serif, system-ui"
                fontStyle="italic"
              >
                {s.text}
              </text>
            ))}

            {/* Voice labels */}
            {(["upper", "cf", "bass"] as const).map((k) => (
              <text
                key={`vl-${k}`}
                x={8}
                y={BANDS[k].top + 2 * 12 + 4}
                fontSize="10"
                fill={LABEL}
                fontFamily="ui-sans-serif, system-ui"
              >
                {k === "upper" ? "Counter I" : k === "cf" ? "Subject" : "Counter II"}
              </text>
            ))}

            {/* Subject-only preview (before composing) */}
            {!comp &&
              subject.map((m, i) => {
                const band = BANDS.cf;
                return (
                  <Notehead
                    key={`pre-${i}`}
                    x={noteX(i, "whole")}
                    y={yFor(m, band)}
                    filled={false}
                    color={INK}
                    acc={staffInfo(m).acc}
                    revealed
                  />
                );
              })}

            {/* Composed notes (revealed by the playhead) */}
            {comp && <ComposedNotes comp={comp} elapsed={elapsed} />}

            {/* Interval labels */}
            {comp &&
              comp.labelsUpperCf.map((lab, i) =>
                lab && i * MEASURE <= elapsed + 0.05 ? (
                  <text
                    key={`iuc-${i}`}
                    x={noteX(i, "whole")}
                    y={130}
                    fontSize="10.5"
                    textAnchor="middle"
                    fill={LABEL}
                    fontFamily="ui-monospace, monospace"
                  >
                    {lab}
                  </text>
                ) : null,
              )}
            {comp &&
              comp.labelsCfBass.map((lab, i) =>
                lab && i * MEASURE <= elapsed + 0.05 ? (
                  <text
                    key={`icb-${i}`}
                    x={noteX(i, "whole")}
                    y={238}
                    fontSize="10.5"
                    textAnchor="middle"
                    fill={LABEL}
                    fontFamily="ui-monospace, monospace"
                  >
                    {lab}
                  </text>
                ) : null,
              )}

            {/* Vetoed candidates — red ghost noteheads that flash then vanish */}
            {comp && <Vetoes comp={comp} elapsed={elapsed} reduced={reduced} />}

            {/* Playhead */}
            {(playing || elapsed > 0) && comp && (
              <line
                x1={playheadX}
                y1={30}
                x2={playheadX}
                y2={SVG_H - 20}
                stroke={PLAYHEAD}
                strokeWidth={2}
                opacity={0.55}
              />
            )}
          </svg>
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => runCompose(subject, true)}
            disabled={subject.length < 4}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compose fugue
          </button>
          <button
            type="button"
            onClick={() => (playing ? stopPlayback() : comp ? startPlayback(comp) : undefined)}
            disabled={!comp}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playing ? "Stop" : "Play"}
          </button>
          <button
            type="button"
            onClick={loadGhostSubject}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Ghost subject
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
        </div>

        {/* Keyboard legend + played subject */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">Play the subject</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Use your computer keyboard — the home row is a D-dorian scale. Play 4–10 notes, then
              press <span className="text-primary">Compose fugue</span>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {KEY_ORDER.map((k) => (
                <KeyCap key={k} k={k} active={lastKey === KEY_MAP[k]} onPlay={handleMusicKey} />
              ))}
              <span className="mx-1 self-center text-xs text-muted-foreground">accidentals:</span>
              {ACC_KEYS.map((k) => (
                <KeyCap key={k} k={k} active={lastKey === KEY_MAP[k]} onPlay={handleMusicKey} accidental />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-base font-medium text-foreground">Your subject</h2>
            {subject.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet — play some keys.</p>
            ) : (
              <p className="font-mono text-sm text-foreground">
                {subject.map((m) => midiName(m)).join(" · ")}
              </p>
            )}
            {report && report.detail.length > 0 && (
              <p className="mt-2 text-xs text-destructive">
                {report.detail.slice(0, 3).join("; ")}
              </p>
            )}
          </section>
        </div>

        {/* How the engine works */}
        <section className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-2 text-base font-medium text-foreground">How the rule engine works</h2>
          <p>
            From the subject (the cantus firmus, plus a stepwise cadential tail to the tonic D), a
            backtracking legal-set search grows two voices note-by-note. At each bar it enumerates
            the in-scale candidate pitches and keeps only those that are consonant on the downbeat,
            avoid parallel and hidden perfect fifths/octaves, keep each line mostly stepwise with
            recoverable leaps, and end in a clausula-vera authentic cadence. The lower voice runs in
            second species (2:1), where a weak-beat dissonance is licensed only as a passing tone.
            When the search rejects a candidate for a parallel or hidden perfect it is drawn as a red
            ghost notehead and vetoed. After composing, an independent verifier re-scans every
            vertical and reports the violation count — it should always read zero.
          </p>
        </section>
      </div>

      <PrototypeNav slugs={["1670-species-loom"]} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// SVG sub-components
// ---------------------------------------------------------------------------

function ManuscriptStaves({ bars }: { bars: number }) {
  const width = bars * BAR_W;
  return (
    <g>
      {(["upper", "cf", "bass"] as const).map((k) => {
        const b = BANDS[k];
        return (
          <g key={k}>
            {[0, 1, 2, 3, 4].map((line) => (
              <line
                key={line}
                x1={LEFT}
                y1={b.top + line * 12}
                x2={LEFT + width}
                y2={b.top + line * 12}
                stroke={STAFF}
                strokeWidth={1}
              />
            ))}
          </g>
        );
      })}
      {/* Barlines */}
      {Array.from({ length: bars + 1 }).map((_, i) => (
        <line
          key={`bl-${i}`}
          x1={LEFT + i * BAR_W}
          y1={BANDS.upper.top}
          x2={LEFT + i * BAR_W}
          y2={BANDS.bass.top + 4 * 12}
          stroke={STAFF}
          strokeWidth={i === bars ? 2 : 0.6}
          opacity={i === bars ? 0.9 : 0.45}
        />
      ))}
    </g>
  );
}

function Notehead({
  x,
  y,
  filled,
  color,
  acc,
  revealed,
  opacity = 1,
}: {
  x: number;
  y: number;
  filled: boolean;
  color: string;
  acc: number;
  revealed: boolean;
  opacity?: number;
}) {
  if (!revealed) return null;
  return (
    <g opacity={opacity}>
      {acc !== 0 && (
        <text x={x - 13} y={y + 4} fontSize="13" fill={color} fontFamily="serif">
          {acc > 0 ? "♯" : "♭"}
        </text>
      )}
      <ellipse
        cx={x}
        cy={y}
        rx={6}
        ry={4.6}
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={filled ? 0 : 1.6}
        transform={`rotate(-18 ${x} ${y})`}
      />
      {filled && <line x1={x + 5.5} y1={y - 1} x2={x + 5.5} y2={y - 22} stroke={color} strokeWidth={1.3} />}
    </g>
  );
}

function ComposedNotes({ comp, elapsed }: { comp: Composition; elapsed: number }) {
  const sched = useMemo(() => buildSchedule(comp), [comp]);
  return (
    <g>
      {sched.map((s, idx) => {
        const band = s.voice === 0 ? BANDS.upper : s.voice === 1 ? BANDS.cf : BANDS.bass;
        const role: "whole" | "strong" | "weak" =
          s.voice === 2 && !s.filled ? "whole" : s.dur >= MEASURE ? "whole" : s.start % MEASURE < 0.01 ? "strong" : "weak";
        const x = s.voice === 2 && s.filled ? noteX(s.bar, role) : noteX(s.bar, "whole");
        const color = s.voice === 1 ? INK : INK_SOFT;
        const revealed = elapsed >= s.start - 0.03;
        return (
          <g key={idx}>
            <Notehead
              x={x}
              y={yFor(s.midi, band)}
              filled={s.filled}
              color={s.passing ? "#7a5a1e" : color}
              acc={staffInfo(s.midi).acc}
              revealed={revealed}
            />
            {s.passing && revealed && (
              <text
                x={x}
                y={yFor(s.midi, band) + 16}
                fontSize="8.5"
                textAnchor="middle"
                fill="#7a5a1e"
                fontFamily="ui-sans-serif, system-ui"
              >
                pt
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Vetoes({ comp, elapsed, reduced }: { comp: Composition; elapsed: number; reduced: boolean }) {
  const nodes: ReactElement[] = [];
  const flashWin = 0.75;
  comp.vetoUpper.forEach((list, bar) => {
    list.forEach((v, j) => {
      const t = bar * MEASURE;
      const age = elapsed - t;
      if (age < 0 || age > flashWin) return;
      const fade = reduced ? 0.5 : 1 - age / flashWin;
      nodes.push(
        <g key={`vu-${bar}-${j}`} opacity={Math.max(0, fade)}>
          <ellipse
            cx={noteX(bar, "whole")}
            cy={yFor(v.midi, BANDS.upper)}
            rx={6.5}
            ry={5}
            fill="none"
            stroke={VETO}
            strokeWidth={1.8}
            transform={`rotate(-18 ${noteX(bar, "whole")} ${yFor(v.midi, BANDS.upper)})`}
          />
          <line
            x1={noteX(bar, "whole") - 8}
            y1={yFor(v.midi, BANDS.upper) + 8}
            x2={noteX(bar, "whole") + 8}
            y2={yFor(v.midi, BANDS.upper) - 8}
            stroke={VETO}
            strokeWidth={1.6}
          />
          <text
            x={noteX(bar, "whole") + 11}
            y={yFor(v.midi, BANDS.upper) - 6}
            fontSize="9"
            fill={VETO}
            fontFamily="ui-monospace, monospace"
          >
            {v.label}
          </text>
        </g>,
      );
    });
  });
  return <g>{nodes}</g>;
}

function KeyCap({
  k,
  active,
  onPlay,
  accidental,
}: {
  k: string;
  active: boolean;
  onPlay: (midi: number) => void;
  accidental?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay(KEY_MAP[k])}
      className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-md border px-2 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary/20 text-primary"
          : accidental
            ? "border-border bg-accent/40 text-muted-foreground hover:bg-accent hover:text-foreground"
            : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <span className="font-mono text-sm uppercase">{k}</span>
      <span className="text-[10px]">{midiName(KEY_MAP[k])}</span>
    </button>
  );
}
