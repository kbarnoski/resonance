"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13248 · Rubatoline — SEE the breathing rubato of Karel's own piano playing.
//
//   ONE QUESTION
//   What if you could watch the elastic push-and-pull of Karel's tempo — his
//   rubato — drawn as a living line of ink? Where his time is steady, the marks
//   fall evenly; where he pushes and pulls, they bunch and spread and a breathing
//   tempo-curve baseline stretches and compresses to match.
//
//   AUDIO   Karel's REAL recorded catalog only (Welcome Home + Snowflake), routed
//           through the SafeMaster ear-safety bus. No synths, no tones, no mic.
//   INPUT   the tamed master's analyser — getByteFrequencyData every frame.
//   TECHNIQUE  causal, real-time:
//             · spectral-flux novelty (sum of positive frame-to-frame magnitude
//               differences) → adaptive peak-pick (running mean + k·std) → note
//               ONSETS, past+present frames only.
//             · inter-onset intervals (IOIs) → a smoothed local pulse / tempo
//               estimate (a lightweight causal Predominant-Local-Pulse) that
//               rises when he speeds up, falls when he slows.
//             · rhythmic STABILITY = coefficient of variation of the last ~8
//               IOIs. Near-zero = metronomic; high = expressive rubato.
//   OUTPUT  SVG-DOM ONLY (never canvas / WebGL): an ink-on-warm-paper scrolling
//           staff. Each onset drops an ink notehead at its moment; a flowing
//           tempo-curve baseline breathes vertically with the estimate; predicted
//           pulse gridlines compress and expand with the local beat; a stability
//           meter distinguishes steady time from push-pull.
//
//   Named references — Grosche & Müller, "Predominant Local Pulse (PLP)";
//   "Rubato: Transcribing Piano Music with Timestamps" (arXiv:2605.24291, 2026);
//   Simon Dixon, "Onset Detection Revisited." (full notes in README.md.)
//
//   SEEDED MUTED DEMO alive on the first painted frame: before any click a
//   deterministic synthetic onset/tempo sequence drives the exact same pipeline —
//   alternating steady and rubato phrases — so the idea reads with zero
//   interaction. Press Play and it switches to the real analysed audio.
//   Seed 0x13248; timing from performance.now() / the ctx clock only; no
//   Math.random / Date.now / new Date anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

// ── seeded PRNG (no Math.random anywhere) ────────────────────────────────────
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── art palette: archival ink on warm paper (art strokes may use hex) ────────
const PAPER_A = "#efe7d4"; // warm paper ground
const PAPER_B = "#e7ddc6"; // faint lower tint
const INK = "#211c12"; // primary ink noteheads / strokes
const INK_SOFT = "#5a5040"; // secondary graphite
const STAFF = "#cabf9f"; // faint ruled staff / pulse grid
const CURVE = "#3a3324"; // the breathing tempo-curve baseline

// ── geometry ─────────────────────────────────────────────────────────────────
const SVG_W = 1160;
const SVG_H = 420;
const PAD_TOP = 54;
const STAFF_BOTTOM = 366;
const PX_PER_SEC = 122; // horizontal scale: seconds → world px
const HEAD_X = 0.8 * SVG_W; // the writing head, fixed on screen

const TEMPO_MIN = 42; // BPM band mapped to the vertical breathing range
const TEMPO_MAX = 150;
const BAND_TOP = PAD_TOP + 40;
const BAND_BOT = STAFF_BOTTOM - 30;

const IOI_MIN = 0.11; // ignore chord simultaneities / detector doubles
const IOI_MAX = 1.9; // ignore long rests when estimating pulse
const IOI_WINDOW = 8; // last-N IOIs for tempo + stability
const BEAT_LOOKAHEAD = 1.2; // predict pulse gridlines this far ahead
const MAX_MARKS = 200;
const MAX_BEATS = 130;
const MAX_CURVE_PTS = 1500;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// faster tempo → higher on the paper (smaller y)
function yFromTempo(bpm: number): number {
  const n = (clamp(bpm, TEMPO_MIN, TEMPO_MAX) - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
  return BAND_BOT - n * (BAND_BOT - BAND_TOP);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Mark {
  id: number;
  t: number; // onset time (seconds, mode clock)
  x: number; // worldX = t * PX_PER_SEC
  y: number; // baseline y at the moment of onset
  strength: number; // 0..1 → notehead boldness
  ioi: number; // interval since previous onset (0 for first)
}

interface Beat {
  id: number;
  x: number; // worldX of a predicted pulse tick
}

const ALL_TRACKS = [
  { group: "Welcome Home", tracks: WELCOME_HOME_TRACKS },
  { group: "Snowflake", tracks: SNOWFLAKE_TRACKS },
];
const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath" (rubato-rich)

type Mode = "demo" | "loading" | "real";

export default function RubatolinePage() {
  const [mode, setMode] = useState<Mode>("demo");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [trackId, setTrackId] = useState(DEFAULT_TRACK_ID);
  const [title, setTitle] = useState("seeded rubato demo");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // throttled readouts
  const [tempoBpm, setTempoBpm] = useState(0);
  const [stability, setStability] = useState(0); // coefficient of variation
  const [onsetCount, setOnsetCount] = useState(0);

  // ── audio-owned refs (never read React state inside rAF) ───────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);
  const modeRef = useRef<Mode>("demo");

  // clocks
  const startPerfRef = useRef(0); // performance.now() at demo start
  const startClockRef = useRef(0); // ctx.currentTime at real start

  // analysis (real)
  const specRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const prevSpecRef = useRef<Float32Array | null>(null);
  const fluxHistRef = useRef<number[]>([]);
  const loudMaxRef = useRef(0.001);

  // shared pulse/rubato state
  const lastOnsetTRef = useRef(-1);
  const ioiHistRef = useRef<number[]>([]);
  const tempoTargetRef = useRef(96);
  const tempoDispRef = useRef(96);
  const stabilityRef = useRef(0);
  const nextBeatTRef = useRef(-1);
  const idRef = useRef(0);
  const beatIdRef = useRef(0);
  const countRef = useRef(0);

  // mark / beat mirrors so the loop reads without re-render
  const marksRef = useRef<Mark[]>([]);
  const beatsRef = useRef<Beat[]>([]);

  // demo scheduler
  const demoNextTRef = useRef(0);
  const demoIRef = useRef(0);
  const demoStrengthRef = useRef(0.5);
  const demoRngRef = useRef<() => number>(mulberry32(0x13248));

  // svg refs (per-frame direct DOM)
  const groupRef = useRef<SVGGElement | null>(null);
  const curveRef = useRef<SVGPolylineElement | null>(null);
  const headRef = useRef<SVGGElement | null>(null);
  const headDotRef = useRef<SVGCircleElement | null>(null);
  const curvePtsRef = useRef<string[]>([]);
  const readoutAccumRef = useRef(0);

  // ── emit one onset into the shared pulse pipeline ──────────────────────────
  const emitOnset = useCallback((nowT: number, strength: number) => {
    const last = lastOnsetTRef.current;
    lastOnsetTRef.current = nowT;

    if (last >= 0) {
      const ioi = nowT - last;
      if (ioi >= IOI_MIN && ioi <= IOI_MAX) {
        const h = ioiHistRef.current;
        h.push(ioi);
        if (h.length > IOI_WINDOW) h.shift();

        // local pulse: robust median IOI → BPM (causal PLP-lite)
        const period = median(h);
        if (period > 0) {
          tempoTargetRef.current = clamp(60 / period, TEMPO_MIN, TEMPO_MAX);
        }
        // rhythmic stability: coefficient of variation of recent IOIs
        if (h.length >= 3) {
          let mean = 0;
          for (const v of h) mean += v;
          mean /= h.length;
          let varr = 0;
          for (const v of h) varr += (v - mean) * (v - mean);
          const std = Math.sqrt(varr / h.length);
          stabilityRef.current = mean > 0 ? std / mean : 0;
        }
      }
    }

    const m: Mark = {
      id: idRef.current++,
      t: nowT,
      x: nowT * PX_PER_SEC,
      y: yFromTempo(tempoDispRef.current),
      strength: clamp(strength, 0, 1),
      ioi: last >= 0 ? nowT - last : 0,
    };
    marksRef.current.push(m);
    if (marksRef.current.length > MAX_MARKS) marksRef.current.shift();
    setMarks(marksRef.current.slice());

    countRef.current++;
    setOnsetCount(countRef.current);

    // seed the predicted-pulse phase from the first onset
    if (nextBeatTRef.current < 0) nextBeatTRef.current = nowT;
  }, []);

  // ── deterministic demo scheduler: steady phrases vs. rubato phrases ────────
  const scheduleNextDemo = useCallback(() => {
    const rng = demoRngRef.current;
    const i = demoIRef.current++;
    const block = Math.floor(i / 12) % 2; // alternate every 12 onsets
    const base = 0.46; // ~130 BPM base pace
    let period: number;
    let strength: number;
    if (block === 0) {
      // steady time — tiny jitter → high stability
      period = base * (1 + (rng() - 0.5) * 0.05);
      strength = 0.55 + rng() * 0.2;
    } else {
      // rubato — a push-pull swell across the phrase + expressive jitter
      const phase = (i % 12) / 12;
      const swell = Math.sin(phase * Math.PI * 2);
      period = base * (1 + swell * 0.55) * (1 + (rng() - 0.5) * 0.28);
      strength = 0.4 + rng() * 0.5;
    }
    demoStrengthRef.current = strength;
    demoNextTRef.current += clamp(period, 0.14, 1.7);
  }, []);

  // ── advance predicted pulse gridlines up to nowT + lookahead ───────────────
  const advanceBeats = useCallback((nowT: number) => {
    if (nextBeatTRef.current < 0) return;
    const period = clamp(60 / tempoDispRef.current, 60 / TEMPO_MAX, 60 / TEMPO_MIN);
    let changed = false;
    let guard = 0;
    while (nextBeatTRef.current <= nowT + BEAT_LOOKAHEAD && guard < 64) {
      const b: Beat = {
        id: beatIdRef.current++,
        x: nextBeatTRef.current * PX_PER_SEC,
      };
      beatsRef.current.push(b);
      if (beatsRef.current.length > MAX_BEATS) beatsRef.current.shift();
      nextBeatTRef.current += period;
      changed = true;
      guard++;
    }
    if (changed) setBeats(beatsRef.current.slice());
  }, []);

  // ── real-time spectral-flux onset detection from the tamed master ──────────
  const detectOnsetReal = useCallback(
    (nowT: number) => {
      const master = masterRef.current;
      const spec = specRef.current;
      const ctx = ctxRef.current;
      if (!master || !spec || !ctx) return;
      const analyser = master.analyser;
      analyser.getByteFrequencyData(spec);
      const N = spec.length;

      let flux = 0;
      let sum = 0;
      const prev = prevSpecRef.current;
      for (let i = 1; i < N; i++) {
        const v = spec[i];
        sum += v;
        if (prev) {
          const d = v - prev[i];
          if (d > 0) flux += d;
          prev[i] = v;
        }
      }
      const loudRaw = sum / (N * 255);
      loudMaxRef.current = Math.max(loudMaxRef.current * 0.9994, loudRaw, 0.001);
      const loud = clamp(loudRaw / loudMaxRef.current, 0, 1);

      // adaptive peak-pick: running mean + k·std over a short window (causal)
      const fh = fluxHistRef.current;
      fh.push(flux);
      if (fh.length > 44) fh.shift();
      let mean = 0;
      for (const f of fh) mean += f;
      mean /= fh.length || 1;
      let varr = 0;
      for (const f of fh) varr += (f - mean) * (f - mean);
      const std = Math.sqrt(varr / (fh.length || 1));
      const thresh = mean + 1.7 * std + 26;
      const refractory = nowT - lastOnsetTRef.current > 0.09;
      if (prev && flux > thresh && refractory && loud > 0.1) {
        emitOnset(nowT, clamp(0.35 + loud * 0.7, 0, 1));
      }
    },
    [emitOnset],
  );

  // ── the animation + analysis frame ─────────────────────────────────────────
  const frame = useCallback(() => {
    const mref = modeRef.current;

    // current "now" in the active clock
    let nowT: number;
    if (mref === "real" && ctxRef.current) {
      nowT = ctxRef.current.currentTime - startClockRef.current;
      detectOnsetReal(nowT);
    } else {
      nowT = (performance.now() - startPerfRef.current) / 1000;
      // fire any due demo onsets
      let guard = 0;
      while (demoNextTRef.current <= nowT && guard < 32) {
        emitOnset(demoNextTRef.current, demoStrengthRef.current);
        scheduleNextDemo();
        guard++;
      }
    }

    // smooth the displayed tempo toward its target (the breathing baseline)
    tempoDispRef.current += (tempoTargetRef.current - tempoDispRef.current) * 0.06;

    advanceBeats(nowT);

    // sample the tempo-curve baseline at the writing head (world coords)
    const cx = nowT * PX_PER_SEC;
    const cy = yFromTempo(tempoDispRef.current);
    const pts = curvePtsRef.current;
    pts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
    if (pts.length > MAX_CURVE_PTS) pts.shift();
    if (curveRef.current) curveRef.current.setAttribute("points", pts.join(" "));

    // camera: scroll the world so the writing head sits at HEAD_X
    if (groupRef.current)
      groupRef.current.setAttribute(
        "transform",
        `translate(${(HEAD_X - cx).toFixed(1)},0)`,
      );
    // the head dot rides the current baseline height
    if (headRef.current)
      headRef.current.setAttribute("transform", `translate(${HEAD_X},0)`);
    if (headDotRef.current) headDotRef.current.setAttribute("cy", cy.toFixed(1));

    // throttled numeric readouts (~9 Hz)
    readoutAccumRef.current += 1;
    if (readoutAccumRef.current >= 6) {
      readoutAccumRef.current = 0;
      setTempoBpm(Math.round(tempoDispRef.current));
      setStability(stabilityRef.current);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [advanceBeats, detectOnsetReal, emitOnset, scheduleNextDemo]);

  // ── reset the whole pulse pipeline for a fresh run ─────────────────────────
  const resetPipeline = useCallback(() => {
    marksRef.current = [];
    beatsRef.current = [];
    setMarks([]);
    setBeats([]);
    curvePtsRef.current = [];
    if (curveRef.current) curveRef.current.setAttribute("points", "");
    ioiHistRef.current = [];
    fluxHistRef.current = [];
    lastOnsetTRef.current = -1;
    nextBeatTRef.current = -1;
    tempoTargetRef.current = 96;
    tempoDispRef.current = 96;
    stabilityRef.current = 0;
    loudMaxRef.current = 0.001;
    idRef.current = 0;
    beatIdRef.current = 0;
    countRef.current = 0;
    setOnsetCount(0);
    setTempoBpm(96);
    setStability(0);
    if (prevSpecRef.current) prevSpecRef.current.fill(0);
  }, []);

  // ── start the muted seeded demo (also the first-frame state) ───────────────
  const startDemo = useCallback(() => {
    resetPipeline();
    demoRngRef.current = mulberry32(0x13248);
    demoIRef.current = 0;
    demoNextTRef.current = 0.6;
    demoStrengthRef.current = 0.5;
    startPerfRef.current = performance.now();
    modeRef.current = "demo";
    setMode("demo");
    setTitle("seeded rubato demo");
    setNotice(null);
  }, [resetPipeline]);

  // ── stop any live audio source ─────────────────────────────────────────────
  const stopSource = useCallback(() => {
    const s = srcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* closing */
      }
      srcRef.current = null;
    }
  }, []);

  // ── Play: switch from the demo to Karel's real analysed audio ──────────────
  const play = useCallback(
    async (id: string) => {
      setNotice(null);
      stopSource();
      modeRef.current = "loading";
      setMode("loading");

      let ctx = ctxRef.current;
      if (!ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        ctxRef.current = ctx;
        const master = createSafeMaster(ctx);
        masterRef.current = master;
        const bins = master.analyser.frequencyBinCount;
        specRef.current = new Uint8Array(new ArrayBuffer(bins));
        prevSpecRef.current = new Float32Array(bins);
      }
      await ctx.resume().catch(() => {});

      let buffer: AudioBuffer;
      let name: string;
      try {
        const loaded = await loadRealTrackBuffer(ctx, id);
        buffer = loaded.buffer;
        name = loaded.title;
      } catch {
        // degrade gracefully: keep the seeded demo running
        setNotice(
          "That track could not be loaded — keeping the seeded rubato demo running.",
        );
        startDemo();
        return;
      }

      resetPipeline();
      const master = masterRef.current!;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(master.input); // ear-safety bus, never ctx.destination
      const t0 = ctx.currentTime + 0.08;
      startClockRef.current = t0;
      src.onended = () => {
        if (srcRef.current === src) {
          srcRef.current = null;
          startDemo(); // fall back to the living demo when the piece ends
        }
      };
      srcRef.current = src;
      src.start(t0);
      modeRef.current = "real";
      setMode("real");
      setTitle(name);
    },
    [resetPipeline, startDemo, stopSource],
  );

  // ── mount: kick the demo + the single rAF loop; full teardown on unmount ───
  useEffect(() => {
    startDemo();
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      const s = srcRef.current;
      if (s) {
        try {
          s.onended = null;
          s.stop();
        } catch {
          /* */
        }
        try {
          s.disconnect();
        } catch {
          /* */
        }
        srcRef.current = null;
      }
      try {
        masterRef.current?.disconnect();
      } catch {
        /* */
      }
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── stability classification ───────────────────────────────────────────────
  const cv = stability;
  const stabilityPct = clamp(cv / 0.5, 0, 1) * 100; // meter fill
  const stabilityLabel =
    onsetCount < 3
      ? "listening…"
      : cv < 0.12
        ? "steady time"
        : cv < 0.26
          ? "gentle push-pull"
          : "expressive rubato";

  const statusText =
    mode === "loading"
      ? `loading · ${title}`
      : mode === "real"
        ? `analysing · ${title}`
        : `muted demo · ${title}`;

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <PrototypeNav slugs={["13248-rubatoline"]} />

      <div className="mx-auto max-w-6xl">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              13248 · Rubatoline
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              The breathing rubato of Karel&rsquo;s piano, drawn as ink
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Real-time, causal onset detection runs on one of Karel&rsquo;s own
              recordings. Where his time is steady the ink marks fall evenly;
              where he pushes and pulls, they bunch and spread and the tempo-curve
              baseline breathes to match. A stability readout tells intentional
              rubato from metronomic time.
            </p>
          </div>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {/* controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => play(trackId)}
            disabled={mode === "loading"}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {mode === "real" ? "Restart track" : "Play"}
          </button>

          <label className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={trackId}
              onChange={(e) => {
                const id = e.target.value;
                setTrackId(id);
                if (modeRef.current === "real") void play(id);
              }}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent"
            >
              {ALL_TRACKS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {statusText}
          </span>
        </div>

        {notice && <p className="mt-3 text-sm text-destructive">{notice}</p>}

        {/* readouts */}
        <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              local tempo
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {tempoBpm > 0 ? tempoBpm : "—"}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                bpm
              </span>
            </div>
          </div>

          <div className="min-w-[200px]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                rhythmic stability
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                CV {cv.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${stabilityPct}%` }}
              />
            </div>
            <div className="mt-1 text-sm text-foreground">{stabilityLabel}</div>
          </div>

          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              onsets
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {onsetCount}
            </div>
          </div>
        </div>

        {/* the ink-on-paper score */}
        <div className="mt-5 overflow-hidden rounded-lg border border-border">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="block w-full"
          >
            <defs>
              <linearGradient id="rl-paper" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={PAPER_A} />
                <stop offset="1" stopColor={PAPER_B} />
              </linearGradient>
            </defs>

            {/* warm paper ground */}
            <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#rl-paper)" />

            {/* fixed faint ruled staff */}
            {[0, 1, 2, 3, 4].map((i) => {
              const y = PAD_TOP + 20 + (i * (STAFF_BOTTOM - PAD_TOP - 20)) / 4;
              return (
                <line
                  key={`staff-${i}`}
                  x1="0"
                  x2={SVG_W}
                  y1={y}
                  y2={y}
                  stroke={STAFF}
                  strokeWidth="1"
                  opacity="0.45"
                />
              );
            })}

            {/* scrolling world: predicted-pulse grid, tempo curve, noteheads */}
            <g ref={groupRef}>
              {/* predicted pulse gridlines — spacing breathes with local tempo */}
              {beats.map((b) => (
                <line
                  key={b.id}
                  x1={b.x}
                  x2={b.x}
                  y1={PAD_TOP}
                  y2={STAFF_BOTTOM}
                  stroke={STAFF}
                  strokeWidth="1"
                  opacity="0.5"
                />
              ))}

              {/* the breathing tempo-curve baseline */}
              <polyline
                ref={curveRef}
                fill="none"
                stroke={CURVE}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.8"
                points=""
              />

              {/* onset ink marks */}
              {marks.map((m) => (
                <NoteMark key={m.id} m={m} />
              ))}
            </g>

            {/* the writing head, fixed on screen */}
            <g ref={headRef} transform={`translate(${HEAD_X},0)`}>
              <line
                x1="0"
                x2="0"
                y1={PAD_TOP - 8}
                y2={STAFF_BOTTOM + 8}
                stroke={INK}
                strokeWidth="1"
                opacity="0.35"
              />
              <circle
                ref={headDotRef}
                cx="0"
                cy={yFromTempo(96)}
                r="4.5"
                fill={INK}
                opacity="0.9"
              />
            </g>

            {/* register hints */}
            <text
              x="12"
              y={BAND_TOP - 6}
              fill={INK_SOFT}
              opacity="0.55"
              fontSize="12"
              fontFamily="system-ui, sans-serif"
            >
              faster
            </text>
            <text
              x="12"
              y={BAND_BOT + 14}
              fill={INK_SOFT}
              opacity="0.55"
              fontSize="12"
              fontFamily="system-ui, sans-serif"
            >
              slower
            </text>
          </svg>
        </div>

        {/* legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            {mode === "real"
              ? "Each onset drops an ink notehead; the baseline rises as he speeds up, falls as he relaxes."
              : "Muted seeded demo — steady phrases (even marks) alternate with rubato phrases (bunching + a breathing line). Press Play for Karel's real audio."}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            faint verticals = predicted pulse
          </span>
        </div>

        {/* design notes */}
        {showNotes && (
          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-6">
            <h2 className="text-sm font-semibold text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                could SEE the elastic push-and-pull of Karel&rsquo;s tempo — his
                rubato — drawn as a living line of ink, rather than only hear it?
              </p>
              <p>
                <span className="text-foreground">Onsets.</span> Every frame the
                tamed master&rsquo;s analyser yields a magnitude spectrum. A
                spectral-flux novelty function sums the positive frame-to-frame
                differences across bins; an adaptive peak-pick (running mean +
                1.7·std, plus a ~90&nbsp;ms refractory gate) fires a note onset —
                causally, from past and present frames only.
              </p>
              <p>
                <span className="text-foreground">Tempo &amp; pulse.</span>{" "}
                Inter-onset intervals feed a robust median that becomes a local
                pulse estimate (a lightweight causal Predominant-Local-Pulse); its
                smoothed value is the vertical height of the breathing baseline and
                the spacing of the predicted-pulse gridlines, which compress when
                he accelerates and stretch when he relaxes.
              </p>
              <p>
                <span className="text-foreground">Stability.</span> The
                coefficient of variation of the last eight IOIs separates
                intentional expressive push-pull (high CV) from metronomic time
                (near-zero CV) — the meter above the score.
              </p>
              <p>
                <span className="text-foreground">Audio.</span> Sound is only ever
                Karel&rsquo;s real recorded catalog (Welcome Home + Snowflake),
                played through an AudioBufferSource into the SafeMaster ear-safety
                bus — never a synth, tone, or microphone. Before you press Play a
                deterministic muted demo drives the identical pipeline so the idea
                reads on the first frame; if a track fails to load the demo simply
                keeps running.
              </p>
              <p>
                <span className="text-foreground">Named references.</span> Grosche
                &amp; Müller, &ldquo;Predominant Local Pulse (PLP)&rdquo;;
                &ldquo;Rubato: Transcribing Piano Music with Timestamps&rdquo;
                (arXiv:2605.24291, 2026); Simon Dixon, &ldquo;Onset Detection
                Revisited.&rdquo;
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── one onset notehead: an inked ellipse on the baseline with a short stem ────
function NoteMark({ m }: { m: Mark }) {
  const rx = 3.6 + m.strength * 4.2;
  const ry = rx * 0.72;
  const stem = 12 + m.strength * 20;
  const op = 0.55 + m.strength * 0.4;
  return (
    <g>
      <line
        x1={m.x + rx * 0.9}
        y1={m.y}
        x2={m.x + rx * 0.9}
        y2={m.y - stem}
        stroke={INK}
        strokeWidth={1 + m.strength * 1.1}
        opacity={op * 0.9}
      />
      <ellipse
        cx={m.x}
        cy={m.y}
        rx={rx}
        ry={ry}
        transform={`rotate(-20 ${m.x} ${m.y})`}
        fill={INK}
        opacity={op}
      />
    </g>
  );
}
