"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAGENTA, NEUTRAL, VIOLET } from "../_shared/palette";
import {
  Accompanist,
  BAR_CHORDS,
  buildSyntheticPerformance,
  detectPitchHz,
  FollowerEngine,
  freqToMidi,
  REFERENCE_SCORE,
  REFERENCE_TITLE,
  TOTAL_BEATS,
  type FollowEventKind,
} from "./follow";

// ── SVG staff geometry ───────────────────────────────────────────────────────
const VIEW_W = 760;
const VIEW_H = 236;
const PAD_T = 20;
const PAD_B = 26;
const PX_PER_BEAT = 42;
const MIDI_LO = 57; // A3
const MIDI_HI = 70; // A♯4
const ROW_H = (VIEW_H - PAD_T - PAD_B) / (MIDI_HI - MIDI_LO + 1);
const CONTENT_W = TOTAL_BEATS * PX_PER_BEAT;

const yFor = (midi: number) => PAD_T + (MIDI_HI - midi) * ROW_H + ROW_H / 2;

type LogLine = { kind: FollowEventKind; detail: string; id: number };

type View = {
  est: number;
  confidence: number;
  spb: number;
  belief: number[];
  followerBeat: number;
  detectedMidi: number;
  matched: boolean[];
  soloist: Array<{ beat: number; midi: number; wrong: boolean }>;
  ribbon: Array<{ t: number; beat: number }>;
  log: LogLine[];
  running: boolean;
};

const N = REFERENCE_SCORE.length;

const emptyView = (): View => ({
  est: 0,
  confidence: 0,
  spb: 0.55,
  belief: new Array(N).fill(0),
  followerBeat: 0,
  detectedMidi: 0,
  matched: new Array(N).fill(false),
  soloist: [],
  ribbon: [],
  log: [],
  running: false,
});

export default function FollowPage() {
  const [view, setView] = useState<View>(emptyView);
  const [mode, setMode] = useState<"demo" | "mic">("demo");
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // engine + transport refs (kept out of React state to avoid stale closures)
  const engineRef = useRef<FollowerEngine | null>(null);
  const perfRef = useRef(buildSyntheticPerformance());
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const clockRef = useRef(0);
  const nextEventRef = useRef(0);
  const followerBeatRef = useRef(0);
  const targetBeatRef = useRef(0);
  const lastBeatIntRef = useRef(-1);
  const lastBarRef = useRef(-1);
  const matchedRef = useRef<boolean[]>(new Array(N).fill(false));
  const soloistRef = useRef<Array<{ beat: number; midi: number; wrong: boolean }>>(
    []
  );
  const logRef = useRef<LogLine[]>([]);
  const logIdRef = useRef(0);
  const detectedMidiRef = useRef(0);
  const detectedUntilRef = useRef(0);
  const runningRef = useRef(true);
  const modeRef = useRef<"demo" | "mic">("demo");
  const mutedRef = useRef(true);
  const lastEmitRef = useRef(0);

  // audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const accompRef = useRef<Accompanist | null>(null);

  // mic refs
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const micStartRef = useRef(0);
  const pendMidiRef = useRef(-1);
  const pendFramesRef = useRef(0);
  const lastOnsetMidiRef = useRef(-1);
  const silentFramesRef = useRef(0);
  const lastOnsetTRef = useRef(-1);

  if (!engineRef.current) engineRef.current = new FollowerEngine(REFERENCE_SCORE);

  const resetTransport = useCallback(() => {
    engineRef.current!.reset();
    clockRef.current = 0;
    nextEventRef.current = 0;
    followerBeatRef.current = 0;
    targetBeatRef.current = 0;
    lastBeatIntRef.current = -1;
    lastBarRef.current = -1;
    matchedRef.current = new Array(N).fill(false);
    soloistRef.current = [];
    logRef.current = [];
    detectedMidiRef.current = 0;
    detectedUntilRef.current = 0;
    pendMidiRef.current = -1;
    pendFramesRef.current = 0;
    lastOnsetMidiRef.current = -1;
    lastOnsetTRef.current = -1;
    micStartRef.current = performance.now();
  }, []);

  // fold one detected onset into the follower + book-keeping
  const onset = useCallback((midi: number, tSec: number) => {
    const eng = engineRef.current!;
    const res = eng.observe(midi, tSec);
    const good = res.emission < 0.8;
    if (good) matchedRef.current[res.est] = true;
    targetBeatRef.current = REFERENCE_SCORE[res.est].beatStart;
    detectedMidiRef.current = midi;
    detectedUntilRef.current = clockRef.current + Math.max(0.3, res.spb * 0.9);

    soloistRef.current.push({
      beat: REFERENCE_SCORE[res.est].beatStart,
      midi,
      wrong: !good,
    });
    if (soloistRef.current.length > 28) soloistRef.current.shift();

    if (res.kind !== "match") {
      logRef.current.push({
        kind: res.kind,
        detail: res.detail,
        id: logIdRef.current++,
      });
      if (logRef.current.length > 7) logRef.current.shift();
    }
    if (good && accompRef.current && !mutedRef.current) accompRef.current.ping(midi);
  }, []);

  // mic onset detection — stable-pitch gating on the analyser frames
  const readMic = useCallback(
    (tSec: number) => {
      const an = analyserRef.current;
      const buf = micBufRef.current;
      const ctx = audioCtxRef.current;
      if (!an || !buf || !ctx) return;
      an.getFloatTimeDomainData(buf);
      const hz = detectPitchHz(buf, ctx.sampleRate);
      if (hz <= 0) {
        silentFramesRef.current++;
        if (silentFramesRef.current > 4) lastOnsetMidiRef.current = -1;
        return;
      }
      silentFramesRef.current = 0;
      const cand = Math.round(freqToMidi(hz));
      if (cand === pendMidiRef.current) pendFramesRef.current++;
      else {
        pendMidiRef.current = cand;
        pendFramesRef.current = 1;
      }
      const settled = pendFramesRef.current >= 3;
      const isNew =
        cand !== lastOnsetMidiRef.current ||
        tSec - lastOnsetTRef.current > 0.22;
      if (settled && isNew) {
        lastOnsetMidiRef.current = cand;
        lastOnsetTRef.current = tSec;
        onset(cand, tSec);
      }
    },
    [onset]
  );

  // drive the accompanist's estimated beat from follower + tempo
  const updateFollowerBeat = useCallback((dt: number) => {
    const eng = engineRef.current!;
    let fb = followerBeatRef.current + dt / eng.spb;
    const diff = targetBeatRef.current - fb;
    if (Math.abs(diff) > 2.5) fb = targetBeatRef.current; // snap on skip/repeat
    else fb += diff * Math.min(1, dt * 3); // ease toward the soloist
    fb = Math.max(0, Math.min(TOTAL_BEATS, fb));
    followerBeatRef.current = fb;

    const beatInt = Math.floor(fb);
    const bar = Math.floor(fb / 4);
    const acc = accompRef.current;
    if (acc && !mutedRef.current) {
      if (bar !== lastBarRef.current && bar >= 0 && bar < BAR_CHORDS.length) {
        const c = BAR_CHORDS[bar];
        acc.chord(c.root, c.quality, eng.spb);
      }
      if (beatInt !== lastBeatIntRef.current && bar < BAR_CHORDS.length) {
        acc.bass(BAR_CHORDS[Math.max(0, Math.min(BAR_CHORDS.length - 1, bar))].root, eng.spb);
      }
    }
    lastBarRef.current = bar;
    lastBeatIntRef.current = beatInt;
  }, []);

  // main loop — created once, reads refs so it never goes stale
  useEffect(() => {
    lastFrameRef.current = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      if (runningRef.current) {
        clockRef.current += dt;
        const clock = clockRef.current;
        if (modeRef.current === "demo") {
          const ev = perfRef.current.events;
          while (
            nextEventRef.current < ev.length &&
            clock >= ev[nextEventRef.current].t
          ) {
            onset(ev[nextEventRef.current].midi, ev[nextEventRef.current].t);
            nextEventRef.current++;
          }
          if (
            nextEventRef.current >= ev.length &&
            clock > perfRef.current.duration
          ) {
            resetTransport();
          }
        } else {
          readMic(clock);
        }
        updateFollowerBeat(dt);
      }

      // throttle React updates to ~30fps
      if (now - lastEmitRef.current > 33) {
        lastEmitRef.current = now;
        const eng = engineRef.current!;
        if (clockRef.current > detectedUntilRef.current)
          detectedMidiRef.current = 0;
        setView({
          est: eng.est,
          confidence: eng.confidence,
          spb: eng.spb,
          belief: eng.belief.slice(),
          followerBeat: followerBeatRef.current,
          detectedMidi: detectedMidiRef.current,
          matched: matchedRef.current.slice(),
          soloist: soloistRef.current.slice(),
          ribbon: eng.ribbon.slice(),
          log: logRef.current.slice(),
          running: runningRef.current,
        });
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      accompRef.current?.dispose();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const ensureAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      accompRef.current = new Accompanist(ctx);
    }
    if (audioCtxRef.current.state === "suspended")
      await audioCtxRef.current.resume();
  }, []);

  const beginDemo = useCallback(async () => {
    setError(null);
    await ensureAudio();
    modeRef.current = "demo";
    setMode("demo");
    resetTransport();
    mutedRef.current = false;
    accompRef.current?.setMuted(false);
    setMuted(false);
    setAudioOn(true);
    runningRef.current = true;
  }, [ensureAudio, resetTransport]);

  const useMic = useCallback(async () => {
    setError(null);
    try {
      await ensureAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const ctx = audioCtxRef.current!;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      analyserRef.current = an;
      micBufRef.current = new Float32Array(an.fftSize);
      modeRef.current = "mic";
      setMode("mic");
      resetTransport();
      mutedRef.current = false;
      accompRef.current?.setMuted(false);
      setMuted(false);
      setAudioOn(true);
      runningRef.current = true;
    } catch {
      setError(
        "Microphone unavailable — staying in self-playing demo mode. Grant mic access and retry to follow your own playing."
      );
      modeRef.current = "demo";
      setMode("demo");
    }
  }, [ensureAudio, resetTransport]);

  const backToDemo = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    modeRef.current = "demo";
    setMode("demo");
    resetTransport();
  }, [resetTransport]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    accompRef.current?.setMuted(next);
    setMuted(next);
  }, []);

  // ── derived readouts ───────────────────────────────────────────────────────
  const fb = view.followerBeat;
  const barNo = Math.floor(fb / 4) + 1;
  const beatInBar = (fb % 4) + 1;
  const bpm = Math.round(60 / view.spb);
  const conf = Math.round(view.confidence * 100);
  const matchedCount = view.matched.filter(Boolean).length;
  const cursorX = fb * PX_PER_BEAT;
  const scrollX = Math.max(0, Math.min(CONTENT_W - VIEW_W, cursorX - VIEW_W * 0.36));
  const cursorScreenX = cursorX - scrollX;
  const pulse = 0.55 + 0.45 * Math.sin(clockRef.current * 6);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      {/* header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            5528 · follow · chamber partner
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Follow
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            A transparent, browser-native accompanist that tracks your place in
            a known score in real time — breathing with your tempo and staying
            with you when you rush, drag, fumble a note, skip ahead, or repeat a
            phrase.
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
        >
          Read the design notes ↗
        </button>
      </div>

      {/* the score staff */}
      <div className="rounded-lg border border-border bg-background/60 p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {REFERENCE_TITLE}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {mode === "mic" ? "listening · mic" : "self-playing demo"}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full select-none overflow-hidden rounded-md"
          style={{ background: VIOLET[950] }}
          role="img"
          aria-label="Scrolling music score with a live follower cursor"
        >
          {/* staff rows */}
          {Array.from({ length: MIDI_HI - MIDI_LO + 1 }, (_, k) => {
            const midi = MIDI_LO + k;
            const isC = ((midi % 12) + 12) % 12 === 0;
            return (
              <line
                key={`row-${midi}`}
                x1={0}
                x2={VIEW_W}
                y1={yFor(midi)}
                y2={yFor(midi)}
                stroke={NEUTRAL[400]}
                strokeOpacity={isC ? 0.28 : 0.1}
                strokeWidth={isC ? 1 : 0.5}
              />
            );
          })}

          {/* scrolling note group */}
          <g transform={`translate(${-scrollX} 0)`}>
            {/* bar lines */}
            {Array.from({ length: Math.ceil(TOTAL_BEATS / 4) + 1 }, (_, b) => (
              <line
                key={`bar-${b}`}
                x1={b * 4 * PX_PER_BEAT}
                x2={b * 4 * PX_PER_BEAT}
                y1={PAD_T - 6}
                y2={VIEW_H - PAD_B + 6}
                stroke={NEUTRAL[400]}
                strokeOpacity={0.16}
                strokeWidth={0.5}
              />
            ))}

            {/* reference notes with belief heat */}
            {REFERENCE_SCORE.map((note, i) => {
              const x = note.beatStart * PX_PER_BEAT + 2;
              const w = note.beatDur * PX_PER_BEAT - 4;
              const y = yFor(note.pitchMidi) - ROW_H * 0.4;
              const h = ROW_H * 0.8;
              const isMatched = view.matched[i];
              const isEst = i === view.est;
              const heat = view.belief[i] ?? 0;
              return (
                <g key={`n-${i}`}>
                  <rect
                    x={x}
                    y={y}
                    width={Math.max(3, w)}
                    height={h}
                    rx={2}
                    fill={isMatched ? VIOLET[500] : VIOLET[600]}
                    fillOpacity={
                      isMatched ? 0.72 : 0.1 + Math.min(0.6, heat * 2.2)
                    }
                    stroke={VIOLET[400]}
                    strokeOpacity={isMatched ? 0.5 : 0.22}
                    strokeWidth={0.75}
                  />
                  {isEst && (
                    <rect
                      x={x - 1.5}
                      y={y - 1.5}
                      width={Math.max(3, w) + 3}
                      height={h + 3}
                      rx={3}
                      fill="none"
                      stroke={VIOLET[200]}
                      strokeOpacity={0.4 + pulse * 0.5}
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              );
            })}

            {/* soloist detected notes (trail) */}
            {view.soloist.map((s, i) => {
              const clamped = Math.max(MIDI_LO, Math.min(MIDI_HI, s.midi));
              return (
                <circle
                  key={`s-${i}`}
                  cx={s.beat * PX_PER_BEAT + 6}
                  cy={yFor(clamped)}
                  r={s.wrong ? 3.5 : 2.4}
                  fill={s.wrong ? "none" : VIOLET[300]}
                  fillOpacity={0.6}
                  stroke={s.wrong ? MAGENTA : VIOLET[200]}
                  strokeOpacity={0.7}
                  strokeWidth={s.wrong ? 1.4 : 0.6}
                />
              );
            })}
          </g>

          {/* follower cursor (fixed screen x) */}
          <line
            x1={cursorScreenX}
            x2={cursorScreenX}
            y1={PAD_T - 8}
            y2={VIEW_H - PAD_B + 8}
            stroke={VIOLET[300]}
            strokeOpacity={0.85}
            strokeWidth={1.5}
          />
          <polygon
            points={`${cursorScreenX - 5},${PAD_T - 8} ${cursorScreenX + 5},${
              PAD_T - 8
            } ${cursorScreenX},${PAD_T - 2}`}
            fill={VIOLET[200]}
          />

          {/* live detected pitch indicator at the cursor */}
          {view.detectedMidi > 0 &&
            view.detectedMidi >= MIDI_LO - 2 &&
            view.detectedMidi <= MIDI_HI + 2 && (
              <polygon
                points={`${cursorScreenX + 4},${yFor(
                  Math.max(MIDI_LO, Math.min(MIDI_HI, view.detectedMidi))
                )} ${cursorScreenX + 12},${
                  yFor(Math.max(MIDI_LO, Math.min(MIDI_HI, view.detectedMidi))) - 4
                } ${cursorScreenX + 12},${
                  yFor(Math.max(MIDI_LO, Math.min(MIDI_HI, view.detectedMidi))) + 4
                }`}
                fill={VIOLET[100]}
              />
            )}
        </svg>
      </div>

      {/* readouts + ribbon + log */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* readouts */}
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Follower state
          </p>
          <div className="grid grid-cols-2 gap-y-3">
            <Readout label="bar · beat" value={`${barNo} · ${beatInBar.toFixed(1)}`} />
            <Readout label="tempo" value={`${isFinite(bpm) ? bpm : "—"} bpm`} />
            <Readout label="confidence" value={`${conf}%`} />
            <Readout label="matched" value={`${matchedCount} / ${N}`} />
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                confidence
              </span>
              <span className="font-mono text-xs text-muted-foreground">{conf}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${conf}%` }}
              />
            </div>
          </div>
        </div>

        {/* alignment ribbon */}
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Alignment · perf-time → score-time
          </p>
          <svg viewBox="0 0 220 96" className="h-auto w-full" role="img" aria-label="Alignment ribbon">
            <rect x={0} y={0} width={220} height={96} fill={VIOLET[950]} rx={4} />
            {/* ideal diagonal */}
            <line x1={6} y1={90} x2={214} y2={6} stroke={NEUTRAL[400]} strokeOpacity={0.18} strokeDasharray="3 3" />
            {view.ribbon.length > 1 && (
              <polyline
                fill="none"
                stroke={VIOLET[300]}
                strokeWidth={1.5}
                strokeOpacity={0.9}
                points={view.ribbon
                  .map((r, i) => {
                    const x = 6 + (i / (view.ribbon.length - 1)) * 208;
                    const y = 90 - (r.beat / TOTAL_BEATS) * 84;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" ")}
              />
            )}
          </svg>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            A staircase that climbs steadily = locked tracking. Vertical drops
            are matched repeats; upward leaps are matched skips.
          </p>
        </div>

        {/* event log */}
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Event log
          </p>
          <ul className="space-y-1.5">
            {view.log.length === 0 && (
              <li className="text-sm text-muted-foreground">Listening…</li>
            )}
            {view.log
              .slice()
              .reverse()
              .map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: logColor(l.kind) }}
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {l.detail}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </div>

      {/* controls */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={beginDemo}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {audioOn && mode === "demo" ? "Restart demo" : "Begin — play along"}
        </button>
        {mode === "demo" ? (
          <button
            onClick={useMic}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Use my microphone
          </button>
        ) : (
          <button
            onClick={backToDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back to demo
          </button>
        )}
        {audioOn && (
          <button
            onClick={toggleMute}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {muted ? "Unmute accompaniment" : "Mute accompaniment"}
          </button>
        )}
        <span className="ml-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {audioOn ? (muted ? "muted" : "sounding") : "silent preview"}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!audioOn && (
        <p className="mt-3 text-sm text-muted-foreground">
          The score is already self-playing above (silent). Press{" "}
          <span className="text-foreground">Begin — play along</span> to hear the
          accompanist follow it, or hand it your own instrument with the
          microphone.
        </p>
      )}

      {/* design notes modal */}
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
              Design notes — Follow
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The verb is FOLLOW.</span> Not
                paint, analyse, or compose — a live performer plays a known
                reference score, and a transparent tracker keeps its place in
                real time, like an automatic page-turner and chamber partner.
              </p>
              <p>
                <span className="text-foreground">The engine</span> is an online
                DTW / cost-grid forward tracker. A belief over positions is held
                as an accumulated cost array. Each detected onset runs one
                relaxation: <em>cost&apos;[j] = emission(pitch, note j) + min over i (
                cost[i] + transition(i, j))</em>. Emission rewards an exact
                pitch, forgives an octave, mildly forgives a neighbour fumble,
                and penalises a far miss — but never blocks, so a wrong note
                costs a little and the tracker holds its place. Transition
                prefers advancing one note, tolerates staying put, and allows
                forward jumps (skips) and backward jumps (repeats) at higher
                cost. A local tempo estimate comes from the timing of recent
                confident advances, and the accompaniment locks to it.
              </p>
              <p>
                <span className="text-foreground">Self-demo.</span> With no mic
                or MIDI, a seeded (mulberry32, 0x5528) synthetic performer plays
                the Ode to Joy theme with deliberate rubato, one wrong note, one
                skip-ahead, and one repeated phrase, so the whole thing tracks
                itself hands-free and reproducibly. A microphone (autocorrelation
                pitch + onset gating) hands it your own playing; Web MIDI would
                feed note-ons directly.
              </p>
              <p>
                <span className="text-foreground">Lineage.</span> A small,
                no-training, browser-native cousin of{" "}
                <em>Matchmaker: An Open-Source Library for Real-Time Piano Score
                Following</em>{" "}
                (arXiv:2510.10087, ISMIR 2025) and{" "}
                <em>The ACCompanion</em> (arXiv:2304.12939), in the classical
                Dannenberg (1984) / Raphael score-following lineage.
              </p>
              <p>
                <span className="text-foreground">Not yet verified.</span>{" "}
                Polyphony (monophonic only), tolerance to heavy background noise,
                and Web MIDI input are untested here; the emission/transition
                costs are hand-tuned rather than learned.
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
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function logColor(kind: FollowEventKind): string {
  switch (kind) {
    case "skip":
      return VIOLET[300];
    case "repeat":
      return MAGENTA;
    case "wrong":
      return VIOLET[600];
    default:
      return VIOLET[400];
  }
}
