"use client";

// ════════════════════════════════════════════════════════════════════════════
// Earwell (20480)
//
// THE ONE QUESTION: "What if you could walk through the harmony of a piano
// recording BY EAR alone — sweeping a cursor around a ring of resonant
// 'stations', each one a chord region of the piece, and hearing that region's
// harmony bloom as you approach it?"
//
// Audio-first + haptic. The art is the SOUND; the SVG is a minimal map of where
// your ear is standing. No canvas, no WebGL, no particles, no camera.
//
// ARCHITECTURE
//   1. ONE shared looping AudioBufferSourceNode of one of Karel's real takes.
//   2. Per-station parallel BiquadFilter BANDPASS banks: each station is a
//      distinct chord region of the piece, its bank tuned to that chord's triad
//      spread across three octaves. The one shared source feeds every bank.
//   3. bank -> summed -> per-station GainNode -> StereoPanner (pan = cos(angle)
//      on the ring) -> the master input.
//   4. Everything terminates at createSafeMaster(ctx).input — never
//      ctx.destination. Zero oscillators anywhere: the only sound is his piano,
//      filtered.
//   5. A cursor has an angle around the ring. Each station's gain is gated by a
//      wrap-aware Gaussian falloff of the angular distance between the cursor and
//      that station, smoothed with setTargetAtTime. Normalized so total loudness
//      stays roughly constant — sweeping the cursor crossfades WHICH harmonic
//      region you hear, so you walk his harmony by ear.
//   6. When the nearest station changes: a guarded navigator.vibrate(14) (silent
//      no-op on desktop) AND an on-screen SVG pulse echo, so desktop users SEE
//      the crossing mobile users FEEL.
//   7. Pointer is the primary control (sweep to set the angle). Arrow keys nudge.
//      When idle, the cursor auto-drifts so the piece is never silent or static.
//
// DEGRADES: no analysis -> the same ring tuned to 8 log-spaced spectral bands.
// Audio load fails -> a designed error state, never a synth.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── geometry ─────────────────────────────────────────────────────────────────
const CENTER = 500;
const RING = 360;

// ── helpers (never named useXxx — that would trip the hooks linter) ────────────
function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

interface StationSpec {
  label: string;
  freqs: number[];
  q: number;
}

/**
 * Collapse a chord timeline into DISTINCT regions: the weightiest distinct
 * chord symbols by total sounding duration, re-ordered by first appearance,
 * targeting ~8–14 stations. Each station's bank is that chord's triad (minor →
 * flat third) spread across octaves 3–5.
 */
function buildChordStations(chords: TrackChord[]): StationSpec[] {
  const map = new Map<
    string,
    { dur: number; first: number; root: number; minor: boolean }
  >();
  for (const c of chords) {
    const root = chordRoot(c.chord);
    if (root === null) continue;
    const existing = map.get(c.chord);
    if (existing) {
      existing.dur += c.duration;
    } else {
      map.set(c.chord, {
        dur: c.duration,
        first: c.time,
        root,
        minor: chordIsMinor(c.chord),
      });
    }
  }
  const entries = [...map.entries()];
  if (entries.length === 0) return [];

  // weightiest by total duration, capped, then re-ordered by first appearance.
  const top = entries
    .sort((a, b) => b[1].dur - a[1].dur)
    .slice(0, 14)
    .sort((a, b) => a[1].first - b[1].first);

  return top.map(([symbol, info]) => {
    const third = info.minor ? 3 : 4;
    const intervals = [0, third, 7]; // root · third · fifth
    const freqs: number[] = [];
    for (const octave of [3, 4, 5]) {
      for (const iv of intervals) {
        const midi = 12 * (octave + 1) + info.root + iv;
        freqs.push(midiToFreq(midi));
      }
    }
    return { label: symbol, freqs, q: 9 };
  });
}

/** No-analysis fallback: 8 log-spaced spectral bands, identical interaction. */
function buildSpectralStations(): StationSpec[] {
  const lo = 120;
  const hi = 6000;
  const n = 8;
  const specs: StationSpec[] = [];
  for (let i = 0; i < n; i++) {
    const center = lo * (hi / lo) ** (i / (n - 1));
    const freqs = [center, center * 2.01]; // a little body above the center
    const label =
      center >= 1000
        ? `${(center / 1000).toFixed(1)} kHz`
        : `${Math.round(center)} Hz`;
    specs.push({ label, freqs, q: 4.5 });
  }
  return specs;
}

/** An arc segment of the ring, centered on a station's angle. */
function arcPath(angle: number, span: number, radius: number): string {
  const a0 = angle - span;
  const a1 = angle + span;
  const x0 = CENTER + radius * Math.cos(a0);
  const y0 = CENTER + radius * Math.sin(a0);
  const x1 = CENTER + radius * Math.cos(a1);
  const y1 = CENTER + radius * Math.sin(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ── runtime types ──────────────────────────────────────────────────────────────
interface StationView {
  angle: number;
  label: string;
  cx: number; // dot on the ring
  cy: number;
  tx: number; // label anchor, just outside the ring
  ty: number;
}

interface StationAudio {
  gain: GainNode;
  panner: StereoPannerNode;
}

interface Engine {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
  master: SafeMaster;
  audios: StationAudio[];
  views: StationView[];
  angles: number[];
  n: number;
  sigma: number;
  weights: Float64Array;
  tbuf: Uint8Array<ArrayBuffer>;
  nearest: number;
  wasIdle: boolean;
  theta: number;
  cursorRadius: number;
  lastInteract: number;
  raf: number;
}

interface Echo {
  id: number;
  cx: number;
  cy: number;
}

type Phase = "ready" | "loading" | "running" | "error";

const SELECT_CLASS =
  "min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-primary";
const PLAY_CLASS =
  "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
const LABEL_CLASS =
  "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

export default function EarwellPage() {
  const { immersive, toggle } = useImmersive();

  const [phase, setPhase] = useState<Phase>("ready");
  const [selectedId, setSelectedId] = useState<string>(REAL_TRACKS[0].id);
  const [title, setTitle] = useState<string>(REAL_TRACKS[0].title);
  const [mode, setMode] = useState<"harmony" | "spectral">("harmony");
  const [stations, setStations] = useState<StationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nearestLabel, setNearestLabel] = useState<string>("—");
  const [driftActive, setDriftActive] = useState<boolean>(true);
  const [echoes, setEchoes] = useState<Echo[]>([]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const arcRefs = useRef<(SVGPathElement | null)[]>([]);
  const labelRefs = useRef<(SVGTextElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const cursorRef = useRef<SVGCircleElement | null>(null);
  const needleRef = useRef<SVGLineElement | null>(null);
  const coreRef = useRef<SVGCircleElement | null>(null);
  const draggingRef = useRef<boolean>(false);
  const echoIdRef = useRef<number>(0);

  const teardown = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    cancelAnimationFrame(e.raf);
    try {
      e.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      e.source.disconnect();
    } catch {
      /* noop */
    }
    for (const a of e.audios) {
      try {
        a.gain.disconnect();
      } catch {
        /* noop */
      }
      try {
        a.panner.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      e.master.disconnect();
    } catch {
      /* noop */
    }
    try {
      void e.ctx.close();
    } catch {
      /* noop */
    }
    engineRef.current = null;
  }, []);

  // ── the per-frame engine: proximity gating + minimal visual echo ─────────────
  const runFrame = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;

    const now = performance.now();
    const idle = now - e.lastInteract > 2200;
    if (idle) {
      e.theta = (e.theta + 0.0042) % (2 * Math.PI);
      e.cursorRadius = RING;
    }
    if (idle !== e.wasIdle) {
      e.wasIdle = idle;
      setDriftActive(idle);
    }

    const theta = e.theta;
    const sigma = e.sigma;
    let sum = 0;
    let best = -1;
    let nearest = 0;
    for (let i = 0; i < e.n; i++) {
      let d = Math.abs(theta - e.angles[i]);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      e.weights[i] = w;
      sum += w;
      if (w > best) {
        best = w;
        nearest = i;
      }
    }

    // apply normalized gains (loudness ~constant) + brightness (relative to peak)
    for (let i = 0; i < e.n; i++) {
      const target = sum > 0 ? e.weights[i] / sum : 0;
      e.audios[i].gain.gain.setTargetAtTime(target, e.ctx.currentTime, 0.1);
      const bright = best > 0 ? e.weights[i] / best : 0;
      const arc = arcRefs.current[i];
      if (arc) {
        arc.style.opacity = (0.12 + 0.88 * bright).toFixed(3);
        arc.style.strokeWidth = (3 + 11 * bright).toFixed(2);
      }
      const label = labelRefs.current[i];
      if (label) label.style.opacity = (0.3 + 0.7 * bright).toFixed(3);
      const dot = dotRefs.current[i];
      if (dot) dot.style.opacity = (0.35 + 0.65 * bright).toFixed(3);
    }

    // nearest-station crossing: haptic + visual echo
    if (nearest !== e.nearest) {
      const previous = e.nearest;
      e.nearest = nearest;
      const view = e.views[nearest];
      setNearestLabel(view.label);
      if (previous !== -1) {
        if (navigator.vibrate) {
          try {
            navigator.vibrate(14);
          } catch {
            /* unsupported */
          }
        }
        const id = echoIdRef.current++;
        setEchoes((prev) => [...prev, { id, cx: view.cx, cy: view.cy }]);
        window.setTimeout(() => {
          setEchoes((prev) => prev.filter((p) => p.id !== id));
        }, 1000);
      }
    }

    // cursor dot + needle
    const cx = CENTER + e.cursorRadius * Math.cos(theta);
    const cy = CENTER + e.cursorRadius * Math.sin(theta);
    if (cursorRef.current) {
      cursorRef.current.setAttribute("cx", cx.toFixed(2));
      cursorRef.current.setAttribute("cy", cy.toFixed(2));
    }
    if (needleRef.current) {
      needleRef.current.setAttribute("x2", cx.toFixed(2));
      needleRef.current.setAttribute("y2", cy.toFixed(2));
    }

    // a faint core breathing with the tamed master signal
    if (coreRef.current) {
      e.master.analyser.getByteTimeDomainData(e.tbuf);
      let acc = 0;
      for (let i = 0; i < e.tbuf.length; i++) {
        const v = (e.tbuf[i] - 128) / 128;
        acc += v * v;
      }
      const rms = Math.sqrt(acc / e.tbuf.length);
      coreRef.current.setAttribute("r", (18 + rms * 120).toFixed(2));
    }

    e.raf = requestAnimationFrame(runFrame);
  }, []);

  const startAudio = useCallback(
    async (id: string) => {
      teardown();
      setError(null);
      setEchoes([]);
      setPhase("loading");

      const ctx = new AudioContext();
      try {
        await ctx.resume();
      } catch {
        /* resumed on gesture */
      }

      let track: Awaited<ReturnType<typeof loadRealTrackBuffer>>;
      try {
        track = await loadRealTrackBuffer(ctx, id);
      } catch {
        setError(
          "Couldn't load this recording. Pick another take and try again.",
        );
        setPhase("error");
        try {
          void ctx.close();
        } catch {
          /* noop */
        }
        return;
      }

      let analysis = null;
      try {
        analysis = await loadTrackAnalysis(id);
      } catch {
        analysis = null;
      }

      let specs: StationSpec[] | null = null;
      let resolvedMode: "harmony" | "spectral" = "harmony";
      if (analysis && analysis.chords.length > 0) {
        const chordSpecs = buildChordStations(analysis.chords);
        if (chordSpecs.length >= 3) specs = chordSpecs;
      }
      if (!specs) {
        specs = buildSpectralStations();
        resolvedMode = "spectral";
      }

      const n = specs.length;
      const master = createSafeMaster(ctx);
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.loop = true;

      const audios: StationAudio[] = [];
      const views: StationView[] = [];
      const angles: number[] = [];

      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n;
        angles.push(angle);

        const sumGain = ctx.createGain();
        sumGain.gain.value = 0.9 / specs[i].freqs.length;
        for (const f of specs[i].freqs) {
          const bp = ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = f;
          bp.Q.value = specs[i].q;
          source.connect(bp);
          bp.connect(sumGain);
        }

        const gain = ctx.createGain();
        gain.gain.value = 0;
        sumGain.connect(gain);

        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, Math.cos(angle)));
        gain.connect(panner);
        panner.connect(master.input);

        audios.push({ gain, panner });
        views.push({
          angle,
          label: specs[i].label,
          cx: CENTER + RING * Math.cos(angle),
          cy: CENTER + RING * Math.sin(angle),
          tx: CENTER + (RING + 46) * Math.cos(angle),
          ty: CENTER + (RING + 46) * Math.sin(angle),
        });
      }

      source.start();

      arcRefs.current = new Array(n).fill(null);
      labelRefs.current = new Array(n).fill(null);
      dotRefs.current = new Array(n).fill(null);

      engineRef.current = {
        ctx,
        source,
        master,
        audios,
        views,
        angles,
        n,
        sigma: ((2 * Math.PI) / n) * 0.72,
        weights: new Float64Array(n),
        tbuf: new Uint8Array(master.analyser.fftSize),
        nearest: -1,
        wasIdle: true,
        theta: 0,
        cursorRadius: RING,
        lastInteract: performance.now() - 9999, // drift immediately
        raf: 0,
      };

      setStations(views);
      setMode(resolvedMode);
      setTitle(track.title);
      setNearestLabel("—");
      setDriftActive(true);
      setPhase("running");
      engineRef.current.raf = requestAnimationFrame(runFrame);
    },
    [teardown, runFrame],
  );

  // tear the engine down when the page unmounts
  useEffect(() => () => teardown(), [teardown]);

  // ── pointer control (primary) ───────────────────────────────────────────────
  const setFromPointer = useCallback((clientX: number, clientY: number) => {
    const e = engineRef.current;
    const svg = svgRef.current;
    if (!e || !svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    let th = Math.atan2(dy, dx);
    if (th < 0) th += 2 * Math.PI;
    e.theta = th;
    const rr = Math.hypot(dx, dy) / (Math.min(rect.width, rect.height) / 2);
    e.cursorRadius = RING * Math.max(0.5, Math.min(1, rr));
    e.lastInteract = performance.now();
  }, []);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      if (!engineRef.current) return;
      draggingRef.current = true;
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
      setFromPointer(ev.clientX, ev.clientY);
    },
    [setFromPointer],
  );

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<SVGSVGElement>) => {
      if (!engineRef.current) return;
      // sweep on hover (mouse) or drag (touch)
      if (ev.pointerType === "mouse" || draggingRef.current) {
        setFromPointer(ev.clientX, ev.clientY);
      }
    },
    [setFromPointer],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const onKeyDown = useCallback((ev: React.KeyboardEvent<SVGSVGElement>) => {
    const e = engineRef.current;
    if (!e) return;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      const step = ev.key === "ArrowLeft" ? -0.09 : 0.09;
      e.theta = (e.theta + step + 2 * Math.PI) % (2 * Math.PI);
      e.cursorRadius = RING;
      e.lastInteract = performance.now();
    }
  }, []);

  const onSelectTrack = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (engineRef.current) void startAudio(id);
    },
    [startAudio],
  );

  const span = stations.length > 0 ? (Math.PI / stations.length) * 0.82 : 0.1;
  const running = phase === "running";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#07070c] text-foreground">
      {/* ── the stage: the ring IS the page ── */}
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        className="absolute inset-0 h-full w-full touch-none select-none"
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="slider"
        aria-label="Sweep the cursor around the ring to move through the recording's harmony"
        aria-valuetext={nearestLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {/* base ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING}
          fill="none"
          stroke="#2a2740"
          strokeWidth={1.5}
        />
        {/* reactive core */}
        <circle ref={coreRef} cx={CENTER} cy={CENTER} r={18} fill="#8b5cf6" opacity={0.16} />

        {/* needle + cursor (only meaningful while running) */}
        {running && (
          <>
            <line
              ref={needleRef}
              x1={CENTER}
              y1={CENTER}
              x2={CENTER + RING}
              y2={CENTER}
              stroke="#c9b8ff"
              strokeWidth={1.25}
              opacity={0.5}
            />
            <circle ref={cursorRef} cx={CENTER + RING} cy={CENTER} r={11} fill="#f5f2ea" />
          </>
        )}

        {/* stations: arcs, ticks, labels — brightened by live gain each frame */}
        {stations.map((s, i) => (
          <g key={`${s.label}-${i}`}>
            <path
              ref={(el) => {
                arcRefs.current[i] = el;
              }}
              d={arcPath(s.angle, span, RING)}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.12}
            />
            <circle
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              cx={s.cx}
              cy={s.cy}
              r={4.5}
              fill="#c9b8ff"
              opacity={0.4}
            />
            <text
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              x={s.tx}
              y={s.ty}
              fill="#f5f2ea"
              fontSize={20}
              fontFamily="ui-monospace, monospace"
              textAnchor={Math.cos(s.angle) > 0.2 ? "start" : Math.cos(s.angle) < -0.2 ? "end" : "middle"}
              dominantBaseline="middle"
              opacity={0.4}
            >
              {s.label}
            </text>
          </g>
        ))}

        {/* pulse echoes — the crossing you FEEL, drawn for the eye */}
        {echoes.map((e) => (
          <circle
            key={e.id}
            cx={e.cx}
            cy={e.cy}
            r={6}
            fill="none"
            stroke="#f5f2ea"
            strokeWidth={2}
          >
            <animate attributeName="r" from="6" to="60" dur="1s" fill="freeze" />
            <animate attributeName="opacity" from="0.9" to="0" dur="1s" fill="freeze" />
            <animate attributeName="stroke-width" from="2.5" to="0.5" dur="1s" fill="freeze" />
          </circle>
        ))}
      </svg>

      {/* ── status line (kept even while immersive) ── */}
      {running && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-40 font-mono text-xs tracking-[0.04em] text-muted-foreground">
          <span className="text-primary">{driftActive ? "idle · drifting" : "pointer"}</span>
          <span className="px-2 text-muted-foreground/50">·</span>
          <span>
            nearest region <span className="text-foreground">{nearestLabel}</span>
          </span>
          <span className="px-2 text-muted-foreground/50">·</span>
          <span>{mode === "harmony" ? "chord stations" : "spectral bands"}</span>
        </div>
      )}

      {/* ── error state ── */}
      {error && (
        <div className="fixed inset-x-0 top-24 z-40 flex justify-center px-4">
          <p className="max-w-md rounded-md border border-destructive/40 bg-background/80 px-4 py-3 text-center text-base text-destructive backdrop-blur-sm">
            {error}
          </p>
        </div>
      )}

      {/* ── chrome (hidden while immersive) ── */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
          <div className="pointer-events-auto max-w-xl p-5 sm:p-8">
            <p className={LABEL_CLASS}>Resonance · dream · 20480</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Earwell
            </h1>
            <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
              Walk through the harmony of Karel&rsquo;s piano by ear. Sweep the
              cursor around the ring — each station is a chord region of the
              take, and the one you stand nearest blooms in your ears.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <label className="sr-only" htmlFor="earwell-track">
                Recording
              </label>
              <select
                id="earwell-track"
                value={selectedId}
                onChange={(ev) => onSelectTrack(ev.target.value)}
                className={SELECT_CLASS}
              >
                {COLLECTIONS.map((col) => (
                  <optgroup key={col.name} label={col.name}>
                    {col.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void startAudio(selectedId)}
                disabled={phase === "loading"}
                className={PLAY_CLASS}
              >
                {phase === "loading"
                  ? "Loading…"
                  : running
                    ? "Restart"
                    : "Play & sweep"}
              </button>

              <ImmersiveHud
                immersive={immersive}
                onToggle={toggle}
                title="Earwell"
                description="Walk through the harmony of a piano recording by ear. Each station on the ring is a chord region of the take; the station nearest your cursor blooms in your ears, so sweeping crossfades which harmony you hear emphasized."
                howTo={[
                  "Press Play, then sweep the cursor around the ring with your mouse or finger.",
                  "The brightest arc is the chord region you are hearing most.",
                  "On a phone you also feel a tap each time you cross into a new region.",
                  "Arrow keys nudge the cursor; let go and it drifts on its own.",
                ]}
              />
            </div>

            {running && (
              <p className="mt-3 font-mono text-xs tracking-[0.04em] text-muted-foreground/70">
                now sweeping · {title}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ImmersiveHud still needs to render its exit/info pills while immersive */}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Earwell"
          description="Walk through the harmony of a piano recording by ear. Each station on the ring is a chord region of the take; the station nearest your cursor blooms in your ears, so sweeping crossfades which harmony you hear emphasized."
          howTo={[
            "Sweep the cursor around the ring with your mouse or finger.",
            "The brightest arc is the chord region you are hearing most.",
            "On a phone you also feel a tap each time you cross into a new region.",
            "Arrow keys nudge the cursor; let go and it drifts on its own.",
          ]}
        />
      )}
    </div>
  );
}
