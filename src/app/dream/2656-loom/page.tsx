"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2656-loom — "What if music kept an explicit MEMORY: a growing library of
// little motifs, and wove the future out of the past — recalling old motifs
// transformed (inverted, augmented, fragmented, expanded into dissonance) so
// the piece is audibly a DIFFERENT piece at minute 8 than at second 0, and you
// can WATCH each motif enter the library and return altered?"
//
//   The loom below is that memory made visible: every motif is a glyph with its
//   own pitch-contour sparkline, placed by birth-time (weft, left→right) and
//   register (up = higher), threaded to its parent by a lineage line (warp).
//   Hue runs violet→magenta with the motif's DISSONANCE against the sounding
//   drone; thickness grows with how often a motif has been recalled. A tension
//   arch steers the weave up into genuine tension and back down into a late
//   RECAPITULATION where an early seed returns, recognizable but transformed.
//
//   Engine + synth are fully deterministic (seeded mulberry32, 0x2656). Visuals
//   animate on load with zero interaction; audio joins after "Begin" (browser
//   autoplay policy). SVG art layer — no Canvas2D, no WebGL required.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loom, type Motif } from "./engine";
import { LoomAudio } from "./audio";

// SVG art-layer geometry (viewBox units).
const W = 1000;
const H = 580;
const ML = 58;
const MR = 22;
const TOP = 40;
const PLOT_H = 420;
const BAND_TOP = H - 96; // tension-curve band
const BAND_H = 56;
const PMIN = -16;
const PMAX = 28;
const PW = W - ML - MR;

const GEN_LOOKAHEAD = 0.4;
const AUDIO_LOOKAHEAD = 0.28;

const xOfTime = (t: number, dur: number) => ML + (t / dur) * PW;
const yOfPitch = (p: number) =>
  TOP + (1 - (p - PMIN) / (PMAX - PMIN)) * PLOT_H;

/** violet(low tension) → magenta(high tension), staying inside the brand ramp. */
function toneColor(tension: number, alpha = 1): string {
  const hue = 266 + Math.max(0, Math.min(1, tension)) * 46;
  const light = 54 + tension * 10;
  return `hsla(${hue.toFixed(0)}, 78%, ${light.toFixed(0)}%, ${alpha})`;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Build the little contour sparkline path for one motif, centred on origin. */
function drawContour(m: Motif): string {
  const n = m.atoms.length;
  if (n === 0) return "";
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of m.atoms) {
    if (a.pitch < lo) lo = a.pitch;
    if (a.pitch > hi) hi = a.pitch;
  }
  const range = hi - lo || 1;
  const gw = 20;
  const gh = 15;
  let d = "";
  for (let i = 0; i < n; i++) {
    const px = -gw / 2 + (n === 1 ? gw / 2 : (i / (n - 1)) * gw);
    const py = gh / 2 - ((m.atoms[i].pitch - lo) / range) * gh;
    d += (i === 0 ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1) + " ";
  }
  return d;
}

interface Anchor {
  music: number;
  audio: number;
}

export default function LoomPage() {
  const loomRef = useRef<Loom | null>(null);
  if (loomRef.current === null) loomRef.current = new Loom({ duration: 480 });
  const loom = loomRef.current;

  const audioRef = useRef<LoomAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const perfStartRef = useRef<number>(0);
  const skipRef = useRef<number>(0);
  const anchorRef = useRef<Anchor | null>(null);
  const schedIdxRef = useRef<number>(0);
  const lastRootRef = useRef<number>(999);

  const [begun, setBegun] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [sketch, setSketch] = useState<number[]>([]);
  const [biasView, setBiasView] = useState(0);
  const [, setFrame] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const musicNow = useCallback(() => {
    if (typeof performance === "undefined") return 0;
    return (performance.now() - perfStartRef.current) / 1000 + skipRef.current;
  }, []);

  const audioTimeFor = useCallback((m: number) => {
    const a = anchorRef.current;
    const audio = audioRef.current;
    if (!a || !audio) return 0;
    return a.audio + (m - a.music);
  }, []);

  // ── main animation + scheduling loop (runs on mount, audio-independent) ──────
  useEffect(() => {
    if (typeof window === "undefined") return;
    perfStartRef.current = performance.now();
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      const m = Math.min(musicNow(), loom.duration + 4);
      loom.advanceTo(m + GEN_LOOKAHEAD);

      const audio = audioRef.current;
      const notes = loom.notes;
      // walk the append-ordered note list once; play only near-future notes.
      while (
        schedIdxRef.current < notes.length &&
        notes[schedIdxRef.current].time <= m + AUDIO_LOOKAHEAD
      ) {
        const nt = notes[schedIdxRef.current];
        if (audio && audio.isStarted && nt.time >= m - 0.05) {
          audio.strike(audioTimeFor(nt.time), nt.pitch, nt.dur, nt.dyn);
        }
        schedIdxRef.current++;
      }

      // drift the drone to follow the harmonic plan.
      if (audio && audio.isStarted) {
        const r = loom.rootAt(Math.min(m, loom.duration - 0.01));
        if (r !== lastRootRef.current) {
          audio.setDroneRoot(r, audioTimeFor(m));
          lastRootRef.current = r;
        }
      }

      setFrame((f) => (f + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // loom + callbacks are stable refs; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const a = new LoomAudio();
      audioRef.current = a;
      const m = musicNow();
      // schedule from "now" — skip everything already in the past.
      let idx = 0;
      const notes = loom.notes;
      while (idx < notes.length && notes[idx].time < m - 0.05) idx++;
      schedIdxRef.current = idx;
      await a.start();
      anchorRef.current = { music: m, audio: a.ctx.currentTime };
      lastRootRef.current = 999;
      setBegun(true);
    } catch {
      setAudioError(
        "Audio unavailable in this browser — the loom keeps weaving silently.",
      );
    }
  }, [loom, musicNow]);

  const jumpAhead = useCallback(() => {
    skipRef.current += 240;
    const after = Math.min(musicNow(), loom.duration + 4);
    loom.advanceTo(after + GEN_LOOKAHEAD);
    // skip the audio backlog and re-anchor so future notes map correctly.
    const notes = loom.notes;
    let idx = schedIdxRef.current;
    while (idx < notes.length && notes[idx].time < after - 0.05) idx++;
    schedIdxRef.current = idx;
    const audio = audioRef.current;
    if (audio && audio.isStarted) {
      anchorRef.current = { music: after, audio: audio.ctx.currentTime };
      lastRootRef.current = 999;
    }
  }, [loom, musicNow]);

  const nudgeTension = useCallback(
    (delta: number) => {
      loom.setTensionBias(loom.getTensionBias() + delta);
      setBiasView(loom.getTensionBias());
    },
    [loom],
  );

  const seedFromSketch = useCallback(() => {
    if (sketch.length < 2) return;
    loom.plantSeed(sketch, musicNow());
    setSketch([]);
    setSeeding(false);
  }, [loom, musicNow, sketch]);

  const onPlotClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!seeding || !svgRef.current) return;
      const pt = svgRef.current.getBoundingClientRect();
      const vy = ((e.clientY - pt.top) / pt.height) * H;
      // invert yOfPitch, clamp to a comfortable singing register.
      const pitch = PMIN + (1 - (vy - TOP) / PLOT_H) * (PMAX - PMIN);
      const clamped = Math.round(Math.max(-8, Math.min(16, pitch)));
      setSketch((s) => (s.length >= 7 ? s : [...s, clamped]));
    },
    [seeding],
  );

  // ── derived render data ──────────────────────────────────────────────────────
  const m = Math.min(musicNow(), loom.duration + 4);
  const dur = loom.duration;
  const visible = loom.motifs.filter((mo) => mo.birth <= m + 0.001);
  const byId = new Map<number, Motif>();
  for (const mo of loom.motifs) byId.set(mo.id, mo);

  // which motifs are sounding right now (for the pulse highlight)?
  const soundingIds = new Set<number>();
  for (const nt of loom.notes) {
    if (nt.time <= m && m < nt.time + nt.dur) soundingIds.add(nt.motifId);
    if (nt.time > m + 0.001) break; // notes are time-ordered
  }

  const playX = xOfTime(Math.min(m, dur), dur);

  // tension-arch guide + actual curve (cheap; recomputed each frame)
  const archPath = (() => {
    let d = "";
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * dur;
      const y = BAND_TOP + BAND_H - loom.tensionTarget(t) * BAND_H;
      d += (i === 0 ? "M" : "L") + xOfTime(t, dur).toFixed(1) + " " + y.toFixed(1) + " ";
    }
    return d;
  })();

  const actualCurve = (() => {
    const pts = visible.slice().sort((a, b) => a.birth - b.birth);
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      const y = BAND_TOP + BAND_H - pts[i].tension * BAND_H;
      d += (i === 0 ? "M" : "L") + xOfTime(pts[i].birth, dur).toFixed(1) + " " + y.toFixed(1) + " ";
    }
    return d;
  })();

  const recapReached = loom.recapReached;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* art layer */}
      <div className="absolute inset-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          onClick={onPlotClick}
          style={{ cursor: seeding ? "crosshair" : "default" }}
        >
          <defs>
            <radialGradient id="loomBg" cx="50%" cy="34%" r="80%">
              <stop offset="0%" stopColor="#160b2b" />
              <stop offset="100%" stopColor="#07040e" />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill="url(#loomBg)" />

          {/* register gridlines (warp guides) */}
          {[-12, -5, 0, 5, 12, 19].map((p) => (
            <line
              key={`g${p}`}
              x1={ML}
              x2={W - MR}
              y1={yOfPitch(p)}
              y2={yOfPitch(p)}
              stroke="#ffffff"
              strokeOpacity={0.05}
              strokeWidth={1}
            />
          ))}

          {/* lineage threads (warp = ancestry) */}
          <g>
            {visible.map((mo) => {
              if (mo.parentId === null) return null;
              const p = byId.get(mo.parentId);
              if (!p || p.birth > m + 0.001) return null;
              const x1 = xOfTime(p.birth, dur);
              const y1 = yOfPitch(p.meanPitch);
              const x2 = xOfTime(mo.birth, dur);
              const y2 = yOfPitch(mo.meanPitch);
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={`l${mo.id}`}
                  d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={toneColor(mo.tension, mo.isRecap ? 0.85 : 0.28)}
                  strokeWidth={mo.isRecap ? 2.2 : 0.8}
                  strokeDasharray={mo.isRecap ? "5 4" : undefined}
                />
              );
            })}
          </g>

          {/* motif glyphs (each a pitch-contour sparkline) */}
          <g>
            {visible.map((mo) => {
              const gx = xOfTime(mo.birth, dur);
              const gy = yOfPitch(mo.meanPitch);
              const on = soundingIds.has(mo.id);
              const width = 1 + Math.min(4, mo.recur * 0.7) + (on ? 1.4 : 0);
              const col = toneColor(mo.tension, 0.95);
              return (
                <g key={`m${mo.id}`} transform={`translate(${gx} ${gy})`}>
                  {(on || mo.isRecap) && (
                    <circle
                      r={mo.isRecap ? 17 : 13}
                      fill="none"
                      stroke={mo.isRecap ? "#e879f9" : col}
                      strokeOpacity={mo.isRecap ? 0.9 : 0.5}
                      strokeWidth={mo.isRecap ? 1.6 : 1}
                    />
                  )}
                  <path
                    d={drawContour(mo)}
                    fill="none"
                    stroke={col}
                    strokeWidth={width}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.55 + Math.min(0.45, mo.recur * 0.12)}
                  />
                </g>
              );
            })}
          </g>

          {/* tension band: target arch (faint) + actual dissonance curve */}
          <line x1={ML} x2={W - MR} y1={BAND_TOP + BAND_H} y2={BAND_TOP + BAND_H} stroke="#ffffff" strokeOpacity={0.12} />
          <path d={archPath} fill="none" stroke="#a78bfa" strokeOpacity={0.35} strokeWidth={1.4} strokeDasharray="4 5" />
          <path d={actualCurve} fill="none" stroke="#e879f9" strokeOpacity={0.85} strokeWidth={1.8} />

          {/* seed sketch preview */}
          {seeding && sketch.length > 0 && (
            <g>
              <path
                d={sketch
                  .map((p, i) => {
                    const sx = playX + 8 + i * 14;
                    return (i === 0 ? "M" : "L") + sx + " " + yOfPitch(p).toFixed(1);
                  })
                  .join(" ")}
                fill="none"
                stroke="#f0abfc"
                strokeWidth={1.5}
              />
              {sketch.map((p, i) => (
                <circle key={`sk${i}`} cx={playX + 8 + i * 14} cy={yOfPitch(p)} r={2.6} fill="#f0abfc" />
              ))}
            </g>
          )}

          {/* playhead (the moving present) */}
          <line x1={playX} x2={playX} y1={TOP - 8} y2={BAND_TOP + BAND_H + 6} stroke="#c4b5fd" strokeOpacity={0.7} strokeWidth={1.2} />
        </svg>
      </div>

      {/* ── chrome ─────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4 sm:p-6">
        {/* top row */}
        <div className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto max-w-lg">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">The Loom of Memory</h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              developing variation over a growing motif library
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Every glyph is a motif the piece remembers; threads show which motif
              it was recalled and transformed from. Hue runs violet to magenta with
              dissonance, thickness with how often a motif returns.
            </p>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* bottom controls */}
        <div className="pointer-events-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>{fmtTime(Math.min(m, dur))} / {fmtTime(dur)}</span>
            <span>motifs: {loom.motifs.length}</span>
            <span>tension bias: {biasView >= 0 ? "+" : ""}{biasView.toFixed(2)}</span>
            <span className={recapReached ? "text-primary" : ""}>
              {recapReached ? "recapitulation reached" : m > dur * 0.82 ? "closing…" : "developing"}
            </span>
          </div>

          {audioError && <p className="text-sm text-destructive">{audioError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {!begun && !audioError && (
              <button
                onClick={beginAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin (unlock sound)
              </button>
            )}
            {begun && (
              <span className="min-h-[44px] inline-flex items-center rounded-md bg-primary/20 px-4 text-sm text-primary">
                weaving + sounding
              </span>
            )}
            <button
              onClick={jumpAhead}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Jump ahead 4 min
            </button>
            <button
              onClick={() => loom.requestRecap()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Toward recapitulation
            </button>
            <button
              onClick={() => nudgeTension(-0.15)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              − dissonance
            </button>
            <button
              onClick={() => nudgeTension(0.15)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              + dissonance
            </button>
            {!seeding ? (
              <button
                onClick={() => {
                  setSeeding(true);
                  setSketch([]);
                }}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Plant a seed
              </button>
            ) : (
              <>
                <span className="min-h-[44px] inline-flex items-center font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  click the loom to sketch a contour ({sketch.length}/7)
                </span>
                <button
                  onClick={seedFromSketch}
                  className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                  disabled={sketch.length < 2}
                >
                  Plant
                </button>
                <button
                  onClick={() => {
                    setSeeding(false);
                    setSketch([]);
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 p-4" onClick={() => setShowNotes(false)}>
          <div
            className="max-h-[80vh] max-w-xl overflow-y-auto rounded-md border border-border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The piece keeps an explicit, growing <span className="text-foreground">library of motifs</span>. New
                motifs are seeded only occasionally; most material is made by
                <span className="text-foreground"> recalling </span> an existing motif and
                <span className="text-foreground"> transforming </span> it — transpose, invert, retrograde,
                augment/diminish, fragment, interval expand/contract, or add chromatic neighbours. This is
                Schoenberg&apos;s <em>developing variation</em> made mechanical.
              </p>
              <p>
                Because transforms compound, a descendant at minute 8 no longer resembles the seeds from
                second 0 — yet a late <span className="text-foreground">recapitulation</span> recalls an early
                motif near-original, for resolution. You can force it with &quot;Toward recapitulation.&quot;
              </p>
              <p>
                <span className="text-foreground">Dissonance is a real, resolvable axis.</span> Interval expansion
                and chromatic neighbours push notes microtonally / chromatically against the sounding drone root;
                a tension arch steers which transforms are chosen. Nudge it with the dissonance buttons.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                refs: Schoenberg (developing variation) · Cope, EMI · arXiv:2603.00576
              </p>
              <p>
                Read the full notes in{" "}
                <Link href="/dream/2656-loom/README.md" className="text-primary underline underline-offset-4">
                  README.md
                </Link>
                .
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
