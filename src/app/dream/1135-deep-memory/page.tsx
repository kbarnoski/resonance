"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SCALES,
  SlowMachine,
  mulberry32,
  type ScaleId,
  type Snapshot,
  type Steering,
} from "./engine";
import { MemoryAudio } from "./audio";

// ── Palette: indigo -> deep teal -> electric cyan -> violet accent ────────────

type RGB = [number, number, number];
const STOPS: RGB[] = [
  [60, 58, 180], // indigo
  [40, 90, 150], // indigo-teal
  [18, 130, 150], // deep teal
  [56, 214, 245], // electric cyan
];
const VIOLET: RGB = [150, 110, 245];

function paletteAt(t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = STOPS[i];
  const b = STOPS[Math.min(STOPS.length - 1, i + 1)];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

// ── Node layout (centered coords) ─────────────────────────────────────────────

interface Node {
  bx: number; // base x relative to center
  by: number;
}

function makeNodes(n: number, radius: number, seed: number): Node[] {
  const rng = mulberry32(seed ^ 0x51ed270b);
  const nodes: Node[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    // organic jitter so it reads as a constellation, not a clock face
    const rj = radius * (0.82 + rng() * 0.28);
    const aj = ang + (rng() - 0.5) * 0.32;
    nodes.push({ bx: Math.cos(aj) * rj, by: Math.sin(aj) * rj });
  }
  return nodes;
}

// ── Firing pulses travelling along a synaptic thread ──────────────────────────

interface Pulse {
  from: number;
  to: number;
  t: number; // 0..1 progress
  strength: number;
}

const SCALE_LIST: ScaleId[] = ["dorian", "pentatonic", "phrygian"];

type Stage = "seed" | "live";

export default function DeepMemoryPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stage, setStage] = useState<Stage>("seed");
  const [scaleId, setScaleId] = useState<ScaleId>("dorian");
  const [motif, setMotif] = useState<number[]>([]);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const [steering, setSteering] = useState<Steering>({
    density: 0.5,
    tension: 0.4,
    register: 0.45,
    mutation: 0.35,
  });
  const [readout, setReadout] = useState({
    step: 0,
    entropy: 0,
    consonance: 0.5,
  });

  // Live-mutable refs (not re-rendered every frame)
  const engineRef = useRef<SlowMachine | null>(null);
  const audioRef = useRef<MemoryAudio | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const pulsesRef = useRef<Pulse[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const cometRef = useRef<{ x: number; y: number; tx: number; ty: number }>({
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
  });
  const seedRef = useRef<number>(0x9e3779b9);
  const stageRef = useRef<Stage>("seed");
  const steeringRef = useRef<Steering>(steering);
  const rafRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    steeringRef.current = steering;
  }, [steering]);

  // Advance the mind one note: step engine, record snapshot, spawn a pulse.
  const advance = useCallback((): { midi: number; consonance: number } | null => {
    const eng = engineRef.current;
    if (!eng) return null;
    const snap = eng.step();
    snapRef.current = snap;
    const [from, to] = snap.firedEdge;
    if (from !== to) {
      // baseline outgoing weight ~ small; use edge value to size the pulse
      const w = snap.matrix[from][to];
      pulsesRef.current.push({
        from,
        to,
        t: 0,
        strength: Math.min(1, w / 8),
      });
      if (pulsesRef.current.length > 40) pulsesRef.current.shift();
    }
    const nodes = nodesRef.current;
    if (nodes[to]) {
      cometRef.current.tx = nodes[to].bx;
      cometRef.current.ty = nodes[to].by;
    }
    return { midi: snap.midi, consonance: snap.consonance };
  }, []);

  // ── The render loop ────────────────────────────────────────────────────────
  const drawField = useCallback((tsMs: number) => {
    const canvas = canvasRef.current;
    const eng = engineRef.current;
    if (!canvas || !eng) {
      rafRef.current = requestAnimationFrame(drawField);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (
      canvas.width !== Math.floor(cssW * dpr) ||
      canvas.height !== Math.floor(cssH * dpr)
    ) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      const rad = Math.min(cssW, cssH) * 0.34;
      nodesRef.current = makeNodes(eng.n, rad, seedRef.current);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = cssW / 2;
    const cy = cssH / 2;
    const nodes = nodesRef.current;
    const snap = snapRef.current ?? eng.snapshot();
    const t = tsMs / 1000;
    const live = stageRef.current === "live";

    // Trailing fade (normal blend) — leaves comet/pulse trails, never clears hard.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3, 6, 16, 0.16)";
    ctx.fillRect(0, 0, cssW, cssH);

    // Slow breathing: gentle scale + drift rotation (no strobe).
    const breath = 1 + Math.sin(t * 0.22) * 0.035;
    const rot = Math.sin(t * 0.05) * 0.12 + t * 0.012;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const tf = (bx: number, by: number) => {
      const sx = bx * breath;
      const sy = by * breath;
      return { x: cx + (sx * cosR - sy * sinR), y: cy + (sx * sinR + sy * cosR) };
    };

    ctx.globalCompositeOperation = "lighter";

    // ── Synaptic threads (memory made visible) ──
    const M = snap.matrix;
    const n = eng.n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const w = M[i][j];
        // Reinforced edges rise well above the ~1 baseline; only those glow.
        const s = (w - 1.0) / 12;
        if (s <= 0.02) continue;
        const strength = Math.min(1, s);
        const a = tf(nodes[i].bx, nodes[i].by);
        const b = tf(nodes[j].bx, nodes[j].by);
        const col = paletteAt(0.35 + strength * 0.6);
        // faint wide glow pass
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${
          0.05 + strength * 0.12
        })`;
        ctx.lineWidth = 1 + strength * 6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // bright thin core
        ctx.strokeStyle = `rgba(${col[0] + 40},${col[1] + 30},${
          col[2] + 10
        },${0.1 + strength * 0.4})`;
        ctx.lineWidth = 0.6 + strength * 1.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ── Firing pulses along threads ──
    const pulses = pulsesRef.current;
    for (let k = pulses.length - 1; k >= 0; k--) {
      const p = pulses[k];
      if (live) p.t += 0.012 + p.strength * 0.006; // smooth, gentle rate
      if (p.t >= 1) {
        pulses.splice(k, 1);
        continue;
      }
      const a = tf(nodes[p.from].bx, nodes[p.from].by);
      const b = tf(nodes[p.to].bx, nodes[p.to].by);
      const px = a.x + (b.x - a.x) * p.t;
      const py = a.y + (b.y - a.y) * p.t;
      const fade = Math.sin(p.t * Math.PI); // brightest mid-thread
      const r = 3 + p.strength * 7;
      const col = paletteAt(0.75);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.7 * fade})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Nodes: luminous cells ──
    for (let i = 0; i < n; i++) {
      const pos = tf(nodes[i].bx, nodes[i].by);
      const isCurrent = i === snap.currentDegree;
      const shimmer = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 1.7);
      const base = i === 0 ? 0.15 : 0.55; // tonic tinted differently
      const heat = isCurrent ? 1 : 0.4 + shimmer * 0.25;
      const rad = (isCurrent ? 16 : 9) + shimmer * 3;
      const col = i === 0 ? VIOLET : paletteAt(base + i / (n * 2));
      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, rad * 2.6);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.9 * heat})`);
      g.addColorStop(0.4, `rgba(${col[0]},${col[1]},${col[2]},${0.35 * heat})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rad * 2.6, 0, Math.PI * 2);
      ctx.fill();
      // bright core
      ctx.fillStyle = `rgba(255,255,255,${isCurrent ? 0.9 : 0.35})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isCurrent ? 3 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Comet: current note tracer with fading trail (trail via fade) ──
    const comet = cometRef.current;
    comet.x += (comet.tx - comet.x) * 0.14;
    comet.y += (comet.ty - comet.y) * 0.14;
    const cpos = tf(comet.x, comet.y);
    const ccol = paletteAt(0.85);
    const cg = ctx.createRadialGradient(cpos.x, cpos.y, 0, cpos.x, cpos.y, 26);
    cg.addColorStop(0, `rgba(255,255,255,0.95)`);
    cg.addColorStop(0.25, `rgba(${ccol[0]},${ccol[1]},${ccol[2]},0.85)`);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, 26, 0, Math.PI * 2);
    ctx.fill();

    // central haze so the field feels volumetric
    const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(cssW, cssH) * 0.5);
    haze.addColorStop(0, "rgba(20,40,80,0.05)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, cssW, cssH);

    rafRef.current = requestAnimationFrame(drawField);
  }, []);

  // Build the engine as soon as a scale is chosen so the idle field is alive.
  useEffect(() => {
    const seed = seedRef.current;
    const eng = new SlowMachine(scaleId, seed);
    engineRef.current = eng;
    snapRef.current = eng.snapshot();
    pulsesRef.current = [];
    // reset comet to current node once nodes exist (draw loop will place them)
    rafRef.current = requestAnimationFrame(drawField);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [scaleId, drawField]);

  // ── Begin: seed motif, start audio (or fallback timer) ──
  const handleBegin = useCallback(async () => {
    // Derive a deterministic seed from the tapped motif (or a fixed constant).
    let seed = 0x9e3779b9;
    for (let i = 0; i < motif.length; i++) {
      seed = (seed ^ ((motif[i] + 1) * 2654435761)) >>> 0;
      seed = (seed * 16777619) >>> 0;
    }
    seedRef.current = seed >>> 0;

    const eng = new SlowMachine(scaleId, seedRef.current);
    eng.steering = { ...steeringRef.current };
    if (motif.length >= 2) eng.seedMotif(motif);
    engineRef.current = eng;
    snapRef.current = eng.snapshot();
    pulsesRef.current = [];
    const rad = 200;
    nodesRef.current = makeNodes(eng.n, rad, seedRef.current);

    setStage("live");
    stageRef.current = "live";

    // Try audio.
    try {
      const audio = new MemoryAudio(() => advance());
      audio.setParams({
        tension: steeringRef.current.tension,
        density: steeringRef.current.density,
        register: steeringRef.current.register,
      });
      await audio.start();
      audioRef.current = audio;
      setAudioError(false);
    } catch {
      setAudioError(true);
      // Visual-only fallback driver so the mind keeps dreaming silently.
      if (fallbackTimerRef.current === null) {
        fallbackTimerRef.current = window.setInterval(() => {
          advance();
        }, 700);
      }
    }
  }, [motif, scaleId, advance]);

  // Push steering into engine + audio whenever dials move.
  useEffect(() => {
    const eng = engineRef.current;
    if (eng) eng.steering = { ...steering };
    const audio = audioRef.current;
    if (audio) {
      audio.setParams({
        tension: steering.tension,
        density: steering.density,
        register: steering.register,
      });
    }
  }, [steering]);

  // Periodic readout (throttled — not every frame).
  useEffect(() => {
    if (stage !== "live") return;
    const id = window.setInterval(() => {
      const s = snapRef.current;
      if (s) setReadout({ step: s.step, entropy: s.entropy, consonance: s.consonance });
    }, 400);
    return () => clearInterval(id);
  }, [stage]);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (fallbackTimerRef.current !== null) clearInterval(fallbackTimerRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handlePerturb = useCallback(() => {
    engineRef.current?.perturb();
  }, []);

  const scale = SCALES[scaleId];

  const setDial = (key: keyof Steering) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value) / 100;
    setSteering((prev) => ({ ...prev, [key]: v }));
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#03040c] text-white">
      {/* The immersive field — always present, alive even before Begin. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(2,3,10,0.75) 100%)",
        }}
      />

      {stage === "seed" ? (
        <SeedStage
          scaleId={scaleId}
          setScaleId={setScaleId}
          motif={motif}
          setMotif={setMotif}
          degreeCount={scale.intervals.length}
          scaleLabel={scale.label}
          onBegin={handleBegin}
        />
      ) : (
        <LiveStage
          steering={steering}
          setDial={setDial}
          onPerturb={handlePerturb}
          readout={readout}
          scaleLabel={scale.label}
          audioError={audioError}
          showNotes={showNotes}
          setShowNotes={setShowNotes}
        />
      )}
    </div>
  );
}

// ── Seed stage ────────────────────────────────────────────────────────────────

function SeedStage(props: {
  scaleId: ScaleId;
  setScaleId: (s: ScaleId) => void;
  motif: number[];
  setMotif: (m: number[]) => void;
  degreeCount: number;
  scaleLabel: string;
  onBegin: () => void;
}) {
  const { scaleId, setScaleId, motif, setMotif, degreeCount, onBegin } = props;
  return (
    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-semibold text-white/95 sm:text-3xl">
          Deep Memory
        </h1>
        <p className="mt-3 text-base text-white/75">
          Watch a mind dream. A piece of music that learns from every note it
          plays — its memory drifting, reinforcing, and re-firing. Steer it, and
          be transported into the field. Minute five is never minute one.
        </p>

        <div className="mt-8">
          <p className="text-base text-white/55">Choose a mode of thought</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {SCALE_LIST.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setScaleId(id);
                  setMotif([]);
                }}
                className={`min-h-[44px] rounded-full px-4 py-2.5 text-base transition ${
                  scaleId === id
                    ? "bg-cyan-400/25 text-white ring-1 ring-cyan-300/60"
                    : "bg-white/5 text-white/75 ring-1 ring-white/10 hover:bg-white/10"
                }`}
              >
                {SCALES[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <p className="text-base text-white/55">
            Tap a short motif — its first memories (optional)
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {Array.from({ length: degreeCount }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMotif([...motif, i].slice(-8))}
                className="min-h-[44px] min-w-[44px] rounded-lg bg-white/5 px-4 py-2.5 text-base text-white/85 ring-1 ring-white/10 transition hover:bg-cyan-400/15"
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="text-base text-white/75">
              {motif.length
                ? motif.map((d) => d + 1).join(" · ")
                : "— (a default seed will be used)"}
            </span>
            {motif.length > 0 && (
              <button
                type="button"
                onClick={() => setMotif([])}
                className="min-h-[44px] rounded-md px-4 py-2.5 text-base text-white/55 hover:text-white/85"
              >
                clear
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onBegin}
          className="mt-10 min-h-[44px] rounded-full bg-cyan-400/90 px-8 py-3 text-xl font-medium text-[#03040c] shadow-[0_0_40px_-4px_rgba(56,214,245,0.7)] transition hover:bg-cyan-300"
        >
          Begin
        </button>
        <p className="mt-4 text-base text-white/55">
          Sound begins on your tap (autoplay is blocked — that&apos;s fine).
        </p>
      </div>
    </div>
  );
}

// ── Live stage ────────────────────────────────────────────────────────────────

function LiveStage(props: {
  steering: Steering;
  setDial: (k: keyof Steering) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPerturb: () => void;
  readout: { step: number; entropy: number; consonance: number };
  scaleLabel: string;
  audioError: boolean;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
}) {
  const { steering, setDial, onPerturb, readout, scaleLabel, audioError, showNotes, setShowNotes } =
    props;

  return (
    <div className="pointer-events-none relative z-10 flex h-full w-full flex-col justify-between p-4 sm:p-6">
      {/* Top readout */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto">
          <h2 className="text-xl font-semibold text-white/95">Deep Memory</h2>
          <p className="text-base text-white/55">
            {scaleLabel} · note {readout.step}
          </p>
        </div>
        <div className="pointer-events-auto text-right">
          <Meter label="entropy" v={readout.entropy} />
          <Meter label="consonance" v={readout.consonance} />
        </div>
      </div>

      {audioError && (
        <p className="pointer-events-auto self-center text-base text-rose-300">
          Web Audio is unavailable — the mind still dreams in silence.
        </p>
      )}

      {/* Bottom control deck */}
      <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl bg-black/35 p-4 ring-1 ring-white/10 backdrop-blur-md sm:p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Dial label="Density" value={steering.density} onChange={setDial("density")} />
          <Dial label="Tension" value={steering.tension} onChange={setDial("tension")} />
          <Dial label="Register" value={steering.register} onChange={setDial("register")} />
          <Dial label="Mutation" value={steering.mutation} onChange={setDial("mutation")} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPerturb}
            className="min-h-[44px] rounded-full bg-violet-400/25 px-6 py-2.5 text-base text-white ring-1 ring-violet-300/50 transition hover:bg-violet-400/40"
          >
            Perturb
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="min-h-[44px] rounded-full px-4 py-2.5 text-base text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {showNotes && (
          <div className="mt-4 max-h-[38vh] overflow-y-auto rounded-xl bg-black/40 p-4 text-base leading-relaxed text-white/75 ring-1 ring-white/10">
            <p className="text-white/95">What you are watching</p>
            <p className="mt-2">
              A live Markov transition matrix over the scale degrees. Each note
              the machine plays is a walk from one degree to the next. The path
              it actually takes is <em>reinforced</em> (Hebbian bump), so
              well-worn routes glow brighter and thicker — that is memory forming
              in front of you. Meanwhile every connection slowly leaks back toward
              a neutral baseline (forgetting) and is nudged by steered noise
              (drift). Because reinforcement, forgetting, drift and your live
              steering all feed back into the sampling distribution, the exact
              state provably never repeats: a drifting attractor, not a loop.
            </p>
            <p className="mt-3 text-white/95">The dials</p>
            <p className="mt-2">
              Density sets how eagerly it moves and how strongly it commits paths
              to memory. Tension pulls it toward restless, dissonant leaps or
              toward home. Register shifts the octave. Mutation is the rate of
              forgetting and drift — turn it up to watch memories dissolve and
              reform. Perturb throws a passing thought through the whole field.
            </p>
            <p className="mt-3 text-white/95">Lineage</p>
            <p className="mt-2">
              Hopfield associative memory / neural fields; Refik Anadol&apos;s
              data-as-living-pigment; Brian Eno&apos;s generative ambient; and the
              long tradition of Markov + Hebbian composition.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Dial(props: {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-base text-white/75">{props.label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(props.value * 100)}
        onChange={props.onChange}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400"
      />
    </label>
  );
}

function Meter(props: { label: string; v: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, props.v)) * 100);
  return (
    <div className="mb-1 flex items-center justify-end gap-2">
      <span className="text-base text-white/55">{props.label}</span>
      <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-cyan-300/80"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-9 text-right text-base tabular-nums text-white/75">{pct}</span>
    </div>
  );
}
