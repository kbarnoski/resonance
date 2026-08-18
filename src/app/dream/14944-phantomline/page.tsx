"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  type TrackNote,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// PHANTOMLINE — the melody that lives in neither speaker.
//
// A dichotic auditory-illusion piece built on Diana Deutsch's scale illusion
// (1973) and Albert Bregman's auditory scene analysis. Wear headphones. Karel's
// real piano take plays, hard-panned so each note jumps to the LEFT or RIGHT ear
// by PITCH HEIGHT — high notes to the right ear, low notes to the left, Deutsch's
// exact mapping. Neither ear physically carries a coherent tune; each receives a
// jagged, gap-riddled fragment. But your auditory cortex groups the stream by
// pitch-proximity and good-continuation and hears a SMOOTHER phantom contour than
// the spatial jumps could ever produce. The gap between the physical L/R signal
// (the two cyan ear-lanes) and the perceived phantom line (the warm centre glow)
// IS the artwork.
//
// 100% of audible sound is Karel's real recording, panned. Zero synthesis.
//
// References: Diana Deutsch, "Musical Illusions and Phantom Words" (2019);
// Deutsch, "An auditory illusion", Nature 251 (1973) — the scale illusion;
// Albert Bregman, "Auditory Scene Analysis" (MIT Press, 1990).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TRACK = REAL_TRACKS[0]; // "Interplay"

// SVG art coordinate system.
const VB_W = 1000;
const VB_H = 600;
const LANE = {
  left: { top: 58, h: 118, label: 40 },
  phantom: { top: 206, h: 210, label: 190 },
  right: { top: 446, h: 118, label: 428 },
};

const WINDOW_S = 9; // seconds of music visible across the SVG width
const MIN_FLIP_S = 0.125; // never flip ears faster than ~8 Hz

// Art palette (raw hex — lives INSIDE the SVG, preserved as-is).
const FIELD = "#050507";
const CYAN = "#67e8f9";
const CYAN_DIM = "#2c6b78";
const PHANTOM_WARM = "#fff7e6";
const PHANTOM_GOLD = "#ffd479";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

interface Prepared {
  /** onset time (s) */
  t: number;
  /** normalized pitch height 0..1 across the track's range */
  h: number;
  /** +1 = right ear (high), -1 = left ear (low) */
  ear: 1 | -1;
}

interface Mark {
  x: number;
  y: number;
  op: number;
}

interface Frame {
  leftMarks: Mark[];
  rightMarks: Mark[];
  phantomD: string;
  playheadX: number;
  ear: 1 | -1;
  glow: number;
  leftAct: number;
  rightAct: number;
}

const EMPTY_FRAME: Frame = {
  leftMarks: [],
  rightMarks: [],
  phantomD: "",
  playheadX: VB_W * 0.62,
  ear: -1,
  glow: 0,
  leftAct: 0,
  rightAct: 0,
};

/** Catmull-Rom → cubic-bezier smoothing for the phantom contour. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(
      1,
    )} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const laneY = (
  band: { top: number; h: number },
  h: number,
): number => band.top + (1 - clamp(h, 0, 1)) * band.h;

export default function PhantomlinePage() {
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK.id);
  const [loading, setLoading] = useState(false);
  const [audioLive, setAudioLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [frame, setFrame] = useState<Frame>(EMPTY_FRAME);
  const [readout, setReadout] = useState({
    mode: "—",
    notes: 0,
    median: 0,
  });

  // audio graph
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);

  // analysis-driven ear routing
  const preparedRef = useRef<Prepared[]>([]);
  const noteIdxRef = useRef(0);
  const currentEarRef = useRef<1 | -1>(-1);
  const lastFlipRef = useRef(0);

  // perceptual fallback (spectral flux) state
  const fallbackRef = useRef(false);
  const fallbackBufRef = useRef<Prepared[]>([]);
  const prevFreqRef = useRef<Float32Array | null>(null);
  const timeBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const fluxBaseRef = useRef(0);

  // render / motion
  const rafRef = useRef(0);
  const reducedRef = useRef(false);
  const glowRef = useRef(0);
  const lastRenderRef = useRef(0);
  const liveRef = useRef(false);

  // ── ear routing from the analysis note-roll ────────────────────────────────
  const applyRouting = useCallback((loopT: number) => {
    const prepared = preparedRef.current;
    const panner = pannerRef.current;
    const ctx = audioCtxRef.current;
    if (!panner || !ctx || prepared.length === 0) return;

    // advance / reset the onset pointer to the most recent note that has passed
    let idx = noteIdxRef.current;
    if (idx >= prepared.length || prepared[idx].t > loopT) idx = 0; // wrapped
    while (idx + 1 < prepared.length && prepared[idx + 1].t <= loopT) idx++;
    noteIdxRef.current = idx;

    const targetEar = prepared[idx].ear;
    const now = ctx.currentTime;
    if (
      targetEar !== currentEarRef.current &&
      now - lastFlipRef.current >= MIN_FLIP_S
    ) {
      currentEarRef.current = targetEar;
      lastFlipRef.current = now;
      // smooth ramp so the ear-flip is a glide, never a click
      panner.pan.setTargetAtTime(targetEar, now, 0.012);
    }
  }, []);

  // ── ear routing from a live onset proxy (no / sparse analysis) ─────────────
  const applyFallbackRouting = useCallback((elapsed: number) => {
    const master = masterRef.current;
    const panner = pannerRef.current;
    const ctx = audioCtxRef.current;
    const freq = freqBufRef.current;
    if (!master || !panner || !ctx || !freq) return;

    master.analyser.getByteFrequencyData(freq);
    const n = freq.length;
    let prev = prevFreqRef.current;
    if (!prev || prev.length !== n) {
      prev = new Float32Array(n);
      prevFreqRef.current = prev;
    }

    // spectral flux (positive spectral change) + spectral centroid
    let flux = 0;
    let wsum = 0;
    let msum = 0;
    for (let i = 0; i < n; i++) {
      const v = freq[i];
      const d = v - prev[i];
      if (d > 0) flux += d;
      wsum += v * i;
      msum += v;
      prev[i] = v;
    }
    const centroid = msum > 0 ? wsum / (msum * n) : 0.5; // 0..1
    const h = clamp(0.15 + centroid * 1.4, 0, 1);

    // adaptive baseline so quiet and loud passages both register onsets
    fluxBaseRef.current = fluxBaseRef.current * 0.9 + flux * 0.1;
    const spike = flux > fluxBaseRef.current * 1.6 + 40;

    const now = ctx.currentTime;
    let ear = currentEarRef.current;
    const idle = now - lastFlipRef.current;
    if (spike && idle >= MIN_FLIP_S * 1.4) {
      // map by brightness, Deutsch-style: bright onset → right ear
      ear = centroid >= 0.5 ? 1 : -1;
      if (ear !== currentEarRef.current) {
        currentEarRef.current = ear;
        lastFlipRef.current = now;
        panner.pan.setTargetAtTime(ear, now, 0.012);
      }
    } else if (idle > 2.5) {
      // ~0.4 Hz periodic swap so a flat signal never stalls the illusion
      ear = (currentEarRef.current === 1 ? -1 : 1) as 1 | -1;
      currentEarRef.current = ear;
      lastFlipRef.current = now;
      panner.pan.setTargetAtTime(ear, now, 0.012);
    }

    // roll a short history of onset marks so no lane is ever blank
    const buf = fallbackBufRef.current;
    buf.push({ t: elapsed, h, ear: currentEarRef.current });
    const cutoff = elapsed - WINDOW_S * 1.1;
    while (buf.length > 0 && buf[0].t < cutoff) buf.shift();
  }, []);

  // ── build one visible SVG frame from note geometry ─────────────────────────
  const composeFrame = useCallback(
    (elapsed: number): Frame => {
      const fallback = fallbackRef.current;
      const playheadX = fallback ? VB_W * 0.82 : VB_W * 0.62;
      const winStart = elapsed - WINDOW_S * (playheadX / VB_W);
      const winEnd = winStart + WINDOW_S;
      const xOf = (t: number) => ((t - winStart) / WINDOW_S) * VB_W;

      const leftMarks: Mark[] = [];
      const rightMarks: Mark[] = [];
      const phantomPts: { x: number; y: number }[] = [];

      const push = (t: number, h: number, ear: 1 | -1) => {
        const x = xOf(t);
        const passed = t <= elapsed;
        // older marks (further behind the playhead) dim; upcoming ones brighten
        const op = passed
          ? clamp(1 - ((elapsed - t) / WINDOW_S) * 1.6, 0.12, 1)
          : clamp(0.85 - ((t - elapsed) / WINDOW_S) * 1.3, 0.2, 0.85);
        if (ear === -1) leftMarks.push({ x, y: laneY(LANE.left, h), op });
        else rightMarks.push({ x, y: laneY(LANE.right, h), op });
        phantomPts.push({ x, y: laneY(LANE.phantom, h) });
      };

      if (fallback) {
        for (const p of fallbackBufRef.current) push(p.t, p.h, p.ear);
      } else {
        const prepared = preparedRef.current;
        const dur = durationRef.current || 1;
        // include ±duration shifts so the looped stream is seamless at the seam
        for (const p of prepared) {
          for (const shift of [-dur, 0, dur]) {
            const nt = p.t + shift;
            if (nt >= winStart - 0.2 && nt <= winEnd + 0.2) push(nt, p.h, p.ear);
          }
        }
      }

      phantomPts.sort((a, b) => a.x - b.x);
      const phantomD = smoothPath(phantomPts);

      // live activity meter: decay from the last flip
      const ctx = audioCtxRef.current;
      const sinceFlip = ctx ? ctx.currentTime - lastFlipRef.current : 1;
      const act = clamp(1 - sinceFlip * 1.4, 0.08, 1);
      const ear = currentEarRef.current;

      return {
        leftMarks,
        rightMarks,
        phantomD,
        playheadX,
        ear,
        glow: glowRef.current,
        leftAct: ear === -1 ? act : 0.08,
        rightAct: ear === 1 ? act : 0.08,
      };
    },
    [],
  );

  // ── the animation loop ─────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const step = () => {
      rafRef.current = requestAnimationFrame(step);
      const ctx = audioCtxRef.current;
      const master = masterRef.current;
      if (!ctx || !master || !liveRef.current) return;

      const elapsed = ctx.currentTime - startTimeRef.current;

      // smoothed RMS drives the phantom glow
      let tb = timeBufRef.current;
      if (!tb) {
        tb = new Uint8Array(new ArrayBuffer(master.analyser.fftSize));
        timeBufRef.current = tb;
      }
      master.analyser.getByteTimeDomainData(tb);
      let sum = 0;
      for (let i = 0; i < tb.length; i++) {
        const v = (tb[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / tb.length);
      const target = clamp(rms * 3.2, 0, 1);
      const ease = reducedRef.current ? 0.06 : 0.14;
      glowRef.current += (target - glowRef.current) * ease;

      // ear routing
      if (fallbackRef.current) {
        applyFallbackRouting(elapsed);
      } else {
        const dur = durationRef.current || 1;
        applyRouting(elapsed % dur);
      }

      // throttle the React re-render of SVG geometry
      const now = performance.now();
      const interval = reducedRef.current ? 66 : 33;
      if (now - lastRenderRef.current >= interval) {
        lastRenderRef.current = now;
        setFrame(composeFrame(elapsed));
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [applyRouting, applyFallbackRouting, composeFrame]);

  // ── start audio (only inside the user gesture) ─────────────────────────────
  const begin = useCallback(
    async (id: string) => {
      if (loading) return;
      setError(null);
      setLoading(true);
      try {
        if (!audioCtxRef.current) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) {
            setNoAudio(true);
            setLoading(false);
            return;
          }
          audioCtxRef.current = new AC();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();

        if (!masterRef.current) {
          masterRef.current = createSafeMaster(ctx);
          masterRef.current.setGain(0.85);
          freqBufRef.current = new Uint8Array(
            new ArrayBuffer(masterRef.current.analyser.frequencyBinCount),
          );
        }

        // stop any current source (track switch)
        if (srcRef.current) {
          try {
            srcRef.current.stop();
            srcRef.current.disconnect();
          } catch {
            /* already stopped */
          }
          srcRef.current = null;
        }

        // load audio + analysis in parallel
        const [wh, analysis] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id),
        ]);

        // decide mode + build the ear-routing table
        const notes: TrackNote[] = analysis?.notes ?? [];
        const usableAnalysis = notes.length >= 12;
        fallbackRef.current = !usableAnalysis;
        setUsingFallback(!usableAnalysis);

        if (usableAnalysis) {
          const midis = notes.map((nn) => nn.midi).sort((a, b) => a - b);
          const median = midis[Math.floor(midis.length / 2)];
          const lo = midis[0];
          const hi = midis[midis.length - 1];
          const span = Math.max(1, hi - lo);
          preparedRef.current = notes.map((nn) => ({
            t: nn.time,
            h: (nn.midi - lo) / span,
            ear: (nn.midi >= median ? 1 : -1) as 1 | -1,
          }));
          setReadout({ mode: "note-roll", notes: notes.length, median });
        } else {
          preparedRef.current = [];
          fallbackBufRef.current = [];
          setReadout({ mode: "perceptual", notes: 0, median: 0 });
        }

        // audio graph: real recording → stereo panner → safe master
        const src = ctx.createBufferSource();
        src.buffer = wh.buffer;
        src.loop = true;
        const panner = ctx.createStereoPanner();
        panner.pan.value = -1;
        src.connect(panner);
        panner.connect(masterRef.current.input);
        src.start();

        srcRef.current = src;
        pannerRef.current = panner;
        durationRef.current = wh.buffer.duration;
        startTimeRef.current = ctx.currentTime;
        noteIdxRef.current = 0;
        currentEarRef.current = -1;
        lastFlipRef.current = ctx.currentTime;

        liveRef.current = true;
        setAudioLive(true);
        setTrackId(id);
        if (!rafRef.current) runLoop();
      } catch (e) {
        setError(
          `Couldn't load Karel's audio — ${
            e instanceof Error ? e.message : "unknown error"
          }. The illusion needs the real recording; nothing here is synthesized.`,
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, runLoop],
  );

  // reduced-motion preference
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      liveRef.current = false;
      try {
        srcRef.current?.stop();
        srcRef.current?.disconnect();
      } catch {
        /* already stopped */
      }
      masterRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const currentTitle =
    REAL_TRACKS.find((t: WelcomeHomeTrack) => t.id === trackId)?.title ??
    DEFAULT_TRACK.title;

  const glowW = 2 + frame.glow * 4.5;
  const glowBlurOp = 0.25 + frame.glow * 0.6;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ── the SVG art field ── */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Three horizontal lanes on a near-black field. The top and bottom cyan lanes show the jagged fragments physically sent to your left and right ears; the bright central lane shows the smooth phantom melody your brain reconstructs from them."
      >
        <defs>
          <filter id="phantom-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        <rect x="0" y="0" width={VB_W} height={VB_H} fill={FIELD} />

        {/* lane baselines + labels */}
        {(
          [
            [LANE.left, "LEFT EAR · physical", CYAN_DIM],
            [LANE.phantom, "PHANTOM LINE · perceived", PHANTOM_GOLD],
            [LANE.right, "RIGHT EAR · physical", CYAN_DIM],
          ] as const
        ).map(([band, label, col], i) => (
          <g key={i}>
            <line
              x1="0"
              x2={VB_W}
              y1={band.top + band.h}
              y2={band.top + band.h}
              stroke="#151a20"
              strokeWidth="1"
            />
            <text
              x="14"
              y={
                band === LANE.phantom ? band.top - 14 : band.top - 10
              }
              fill={col}
              fontSize="13"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              letterSpacing="2.4"
              opacity="0.75"
            >
              {label}
            </text>
          </g>
        ))}

        {/* left/right ear physical marks (cyan, jagged) */}
        {frame.leftMarks.map((m, i) => (
          <circle
            key={`l${i}`}
            cx={m.x}
            cy={m.y}
            r="2.6"
            fill={CYAN}
            opacity={m.op}
          />
        ))}
        {frame.rightMarks.map((m, i) => (
          <circle
            key={`r${i}`}
            cx={m.x}
            cy={m.y}
            r="2.6"
            fill={CYAN}
            opacity={m.op}
          />
        ))}

        {/* phantom contour — the smooth line neither ear contains */}
        {frame.phantomD && (
          <>
            <path
              d={frame.phantomD}
              fill="none"
              stroke={PHANTOM_GOLD}
              strokeWidth={glowW + 3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={glowBlurOp}
              filter="url(#phantom-glow)"
            />
            <path
              d={frame.phantomD}
              fill="none"
              stroke={PHANTOM_WARM}
              strokeWidth={glowW}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />
          </>
        )}

        {/* playhead */}
        <line
          x1={frame.playheadX}
          x2={frame.playheadX}
          y1="30"
          y2={VB_H - 20}
          stroke={PHANTOM_WARM}
          strokeWidth="1"
          opacity="0.4"
        />

        {/* left / right activity meter */}
        <rect
          x="4"
          y={LANE.left.top}
          width="6"
          height={LANE.left.h}
          rx="3"
          fill={CYAN}
          opacity={frame.leftAct}
        />
        <rect
          x={VB_W - 10}
          y={LANE.right.top}
          width="6"
          height={LANE.right.h}
          rx="3"
          fill={CYAN}
          opacity={frame.rightAct}
        />
      </svg>

      {/* ── chrome ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            dichotic illusion · deutsch scale illusion
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Phantomline
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            See the phantom melody your own brain assembles from two ears — a
            smooth line that exists in neither speaker.
          </p>

          <p className="mt-3 max-w-md text-base text-foreground">
            Put on headphones. Each note is hard-panned to one ear by its pitch —
            high notes right, low notes left — so neither ear carries a real tune.
            On speakers the illusion collapses.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!audioLive ? (
              <button
                type="button"
                onClick={() => begin(trackId)}
                disabled={loading || noAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Play in headphones"}
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground">
                sound live · {currentTitle}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>

          {/* track selector */}
          <div className="mt-3 flex max-w-lg flex-wrap gap-1.5">
            {REAL_TRACKS.map((t: WelcomeHomeTrack) => {
              const active = t.id === trackId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => (audioLive ? begin(t.id) : setTrackId(t.id))}
                  disabled={loading}
                  className={
                    active
                      ? "min-h-[44px] rounded-md bg-primary/90 px-3 text-xs font-medium text-primary-foreground transition-colors disabled:opacity-60"
                      : "min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                  }
                >
                  {t.title}
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-2 max-w-md text-base text-destructive">{error}</p>
          )}
          {noAudio && (
            <p className="mt-2 max-w-md text-base text-destructive">
              This browser has no Web Audio support, so the dichotic illusion
              can&apos;t be rendered.
            </p>
          )}
        </div>
      </div>

      {/* readout */}
      {audioLive && (
        <div className="pointer-events-none absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
          <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              routing
            </div>
            <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">
              {frame.ear === 1 ? "RIGHT" : "LEFT"}
            </div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
              {usingFallback
                ? "perceptual fallback"
                : `${readout.notes} notes · split at midi ${readout.median}`}
            </div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground/80">
              mode · {readout.mode}
            </div>
          </div>
        </div>
      )}

      {/* headphones hint */}
      {audioLive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
          <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
            cyan = what each ear physically gets · gold = the line your brain
            infers
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Phantomline — design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The question: what if you could SEE the phantom melody your own
              brain assembles from two ears — a line that exists in neither
              speaker?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This is a dichotic auditory illusion built on Diana Deutsch&apos;s
              scale illusion (1973). Karel&apos;s real piano take plays, but every
              note is hard-panned by pitch height using Deutsch&apos;s exact
              mapping: high notes to the right ear, low notes to the left. We
              split at the track&apos;s median pitch. So each ear physically
              receives only a jagged, gap-riddled half of the music — the two cyan
              lanes — and neither ear on its own carries a coherent tune.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Yet you don&apos;t hear jumps. Following Albert Bregman&apos;s
              auditory scene analysis (1990), your auditory cortex groups the
              stream by pitch-proximity and good-continuation and reconstructs a
              SMOOTHER contour than the spatial signal contains — the warm gold
              line down the centre. The gap between the physical L/R signal and
              that perceived phantom line is the whole piece.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Audio graph: the real recording → a StereoPanner → the ear-safe
              master. Nothing is synthesized — 100% of the sound is Karel&apos;s
              take, only its position moves. Ear-flips are smoothed with a short
              pan ramp and rate-limited to about 8 Hz so dense runs hold one ear
              instead of clicking. When a track has no usable note-roll, the piece
              degrades to a live onset proxy — spectral flux from the analyser
              flips ears on note attacks (with a slow periodic swap as a floor),
              flagged as &ldquo;perceptual fallback.&rdquo;
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              References:{" "}
              <span className="text-foreground">Diana Deutsch</span>,
              &ldquo;Musical Illusions and Phantom Words&rdquo; (2019); Deutsch,
              &ldquo;An auditory illusion,&rdquo; Nature 251 (1973) — the scale
              illusion; Albert Bregman,{" "}
              <span className="text-foreground">
                &ldquo;Auditory Scene Analysis&rdquo;
              </span>{" "}
              (MIT Press, 1990).
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14944-phantomline"]} />
    </main>
  );
}
