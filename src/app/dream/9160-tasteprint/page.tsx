"use client";

// 9160-tasteprint — an instrument that LEARNS your ear from a single Keep/Pass
// bit, REMEMBERS you across visits (localStorage), and draws a legible SVG
// SELF-PORTRAIT of your taste. Spiritual successor to 8488-secondear; the two
// things it adds are cross-session persistence and an inline-SVG portrait (its
// ancestor used Canvas2D, banned this cycle). See README.md.

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeCandidates, mulberry32, type Phrase } from "./compose";
import {
  bestCandidate,
  clearModel,
  extractFeatures,
  FEATURE_DIM,
  idealAxes,
  learn,
  makeModel,
  predict,
  proposeGreeting,
  restoreModel,
  saveModel,
  SCATTER_X,
  SCATTER_Y,
  syntheticKeeps,
  type TasteModel,
} from "./taste";

// ── tuning constants ─────────────────────────────────────────────────────────
const STEPS = 16;
const BPM = 104;
const BATCH = 24; // diverse candidates ranked per proposal
const ACC_WINDOW = 14; // windowed "knows-your-ear" accuracy
const DEMO_STEP_MS = 200; // seeded self-demo cadence
const DEMO_STEP_MS_REDUCED = 520;
const SCATTER_MAX = 30;
const BASE_SEED = 0x9160;

// ── art-layer palette (raw hex ONLY here — the SVG paints its own parchment) ──
const PAPER = "#efe6d3";
const PAPER_EDGE = "#d8c8a6";
const INK = "#3a3020";
const INK_SOFT = "#8a7a5c";
const EMBER = "#c8551f";
const KEPT = "#c8551f";
const PASSED = "#b0a082";

const ABBREV = ["reg", "rng", "dns", "syn", "cnt", "int", "dis", "lp"];

// ── view model handed to the render each frame ───────────────────────────────
interface ScatterPt {
  x: number; // 0..1 density
  y: number; // 0..1 register
  kept: boolean;
}
interface View {
  source: "demo" | "human";
  soundOn: boolean;
  axes: number[]; // display (lerped) ideal-ear per axis, 0..1
  accuracy: number; // display windowed accuracy 0..1
  predictions: number; // window fill
  kept: number;
  passed: number;
  sessions: number;
  returning: boolean;
  greeting: string;
  scatter: ScatterPt[];
  current: Phrase | null;
  note: string | null; // graceful-degradation notice (destructive)
  reduced: boolean;
}

interface Engine {
  keep: () => void;
  pass: () => void;
  skip: () => void;
  reset: () => void;
  enableSound: () => void;
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export default function Page() {
  const engineRef = useRef<Engine | null>(null);
  const [view, setView] = useState<View>({
    source: "demo",
    soundOn: false,
    axes: new Array(FEATURE_DIM).fill(0.5),
    accuracy: 0,
    predictions: 0,
    kept: 0,
    passed: 0,
    sessions: 1,
    returning: false,
    greeting: "",
    scatter: [],
    current: null,
    note: null,
    reduced: false,
  });

  useEffect(() => {
    // ── audio (created lazily on a real gesture) ──
    let audio: import("./audio").TasteprintAudio | null = null;
    let rafId = 0;
    let disposed = false;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // ── persistent human model ──
    const restore = restoreModel();
    const human: TasteModel = restore.model;
    const storageOk = restore.available;
    const returning = restore.returning;

    // ── seeded self-demo model (NEVER the persisted human one) ──
    const demo: TasteModel = makeModel();
    const demoRng = mulberry32(BASE_SEED);

    // demo runs only for brand-new visitors; a returning ear sees ITS OWN
    // restored portrait immediately (that is the greet-back).
    let source: "demo" | "human" = returning ? "human" : "demo";
    let demoActive = !returning;

    let liveSeed = 0;
    let current: Phrase | null = null;
    let currentFeats: number[] = [];
    const accWindow: boolean[] = [];
    const scatter: ScatterPt[] = [];
    let soundOn = false;
    let note: string | null = storageOk
      ? null
      : "Private mode: your ear won't be remembered between visits.";

    const activeModel = () => (source === "demo" ? demo : human);

    const displayAxes = idealAxes(activeModel());
    const targetAxes = idealAxes(activeModel());
    let displayAcc = 0;
    let targetAcc = 0;
    let lastDemoStep = 0;

    const greeting = returning
      ? proposeGreeting(human)
      : "A fresh ear. Watch it teach itself below, then take over.";

    function proposeNext(model: TasteModel) {
      liveSeed += 1;
      const rng = mulberry32((BASE_SEED ^ Math.imul(liveSeed, 0x9e3779b1)) >>> 0);
      const cands = makeCandidates(rng, BATCH, STEPS);
      const feats = cands.map(extractFeatures);
      const idx = bestCandidate(model, feats);
      current = cands[idx];
      currentFeats = feats[idx];
    }

    function pushScatter(feats: number[], kept: boolean) {
      scatter.push({ x: feats[SCATTER_X], y: feats[SCATTER_Y], kept });
      if (scatter.length > SCATTER_MAX) scatter.shift();
    }

    function accuracy(): number {
      if (accWindow.length === 0) return 0;
      let c = 0;
      for (const b of accWindow) if (b) c++;
      return c / accWindow.length;
    }

    function recordPrediction(model: TasteModel, feats: number[], kept: boolean) {
      const predicted = predict(model, feats) > 0.5;
      accWindow.push(predicted === kept);
      if (accWindow.length > ACC_WINDOW) accWindow.shift();
    }

    function retargetFrom(model: TasteModel) {
      const t = idealAxes(model);
      for (let i = 0; i < FEATURE_DIM; i++) targetAxes[i] = t[i];
      targetAcc = accuracy();
    }

    function flush() {
      if (disposed) return;
      setView({
        source,
        soundOn,
        axes: displayAxes.slice(),
        accuracy: displayAcc,
        predictions: accWindow.length,
        kept: human.keptCount,
        passed: human.passCount,
        sessions: human.sessions,
        returning,
        greeting,
        scatter: scatter.slice(),
        current,
        note,
        reduced,
      });
    }

    // ── the seeded self-demo step (visual only, no audio) ──
    function demoStep() {
      const feats = currentFeats;
      const kept = syntheticKeeps(demoRng, feats);
      recordPrediction(demo, feats, kept);
      learn(demo, feats, kept ? 1 : 0);
      pushScatter(feats, kept);
      retargetFrom(demo);
      proposeNext(demo);
    }

    // ── real human bit ──
    function humanBit(kept: boolean) {
      if (source === "demo") {
        handover();
        return;
      }
      const feats = currentFeats;
      recordPrediction(human, feats, kept);
      learn(human, feats, kept ? 1 : 0);
      pushScatter(feats, kept);
      if (!saveModel(human) && storageOk) {
        note = "Could not save your ear this time.";
      }
      retargetFrom(human);
      proposeNext(human);
      if (soundOn && current) audio?.playPhrase(current, BPM);
      flush();
    }

    function handover() {
      source = "human";
      demoActive = false;
      accWindow.length = 0; // the human sees THEIR meter climb from zero
      scatter.length = 0;
      targetAcc = 0;
      retargetFrom(human);
      proposeNext(human);
      if (soundOn && current) audio?.playPhrase(current, BPM);
      flush();
    }

    function skip() {
      if (source === "demo") {
        handover();
        return;
      }
      proposeNext(human);
      if (soundOn && current) audio?.playPhrase(current, BPM);
      flush();
    }

    async function enableSound() {
      if (!audio) {
        const mod = await import("./audio");
        audio = new mod.TasteprintAudio();
      }
      const ok = await audio.ensure();
      if (!ok) {
        note = "Sound is blocked here — the portrait keeps learning silently.";
        flush();
        return;
      }
      soundOn = true;
      note = storageOk ? null : note; // keep any storage notice
      if (source === "demo") {
        handover();
      } else {
        if (current) audio.playPhrase(current, BPM);
        flush();
      }
    }

    function reset() {
      clearModel();
      // rebuild both models and restart the demo experience
      Object.assign(human, makeModel());
      Object.assign(demo, makeModel());
      source = "demo";
      demoActive = true;
      accWindow.length = 0;
      scatter.length = 0;
      liveSeed = 0;
      displayAcc = 0;
      targetAcc = 0;
      const flat = idealAxes(demo);
      for (let i = 0; i < FEATURE_DIM; i++) {
        displayAxes[i] = flat[i];
        targetAxes[i] = flat[i];
      }
      proposeNext(demo);
      flush();
    }

    engineRef.current = {
      keep: () => humanBit(true),
      pass: () => humanBit(false),
      skip,
      reset,
      enableSound: () => void enableSound(),
    };

    // first proposal for whatever model is active
    proposeNext(activeModel());
    retargetFrom(activeModel());
    if (returning) {
      const t = idealAxes(human);
      for (let i = 0; i < FEATURE_DIM; i++) displayAxes[i] = t[i];
    }

    // ── keyboard input ──
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        humanBit(true);
      } else if (k === "j" || k === "p") {
        e.preventDefault();
        humanBit(false);
      } else if (k === " " || k === "spacebar") {
        e.preventDefault();
        skip();
      } else if (k === "r") {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);

    // ── animation loop: drive the demo + smoothly morph the portrait ──
    const stepMs = reduced ? DEMO_STEP_MS_REDUCED : DEMO_STEP_MS;
    const lerp = reduced ? 1 : 0.16;
    const loop = (now: number) => {
      if (demoActive && now - lastDemoStep > stepMs) {
        demoStep();
        lastDemoStep = now;
      }
      for (let i = 0; i < FEATURE_DIM; i++) {
        displayAxes[i] += (targetAxes[i] - displayAxes[i]) * lerp;
      }
      displayAcc += (targetAcc - displayAcc) * (reduced ? 1 : 0.1);
      flush();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKey);
      audio?.close();
      audio = null;
    };
    // mount/unmount lifecycle only — all live state lives in closures/refs,
    // so there are no reactive dependencies to track.
  }, []);

  const eng = engineRef;
  const isDemo = view.source === "demo";

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <PrototypeNav slugs={["9160-tasteprint"]} />

      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          9160 · tasteprint
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          An instrument that learns your ear — one Keep/Pass bit at a time
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          It proposes a short phrase; you give exactly one bit. From that stream
          it builds an online model of your taste, remembers you between visits,
          and draws the portrait of your own ear below.
        </p>
      </header>

      {/* greet-back / status */}
      <div className="mb-6 rounded-md border border-border bg-muted/40 px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {view.returning ? `welcome back · visit ${view.sessions}` : "status"}
        </p>
        <p className="mt-1 text-base text-foreground">{view.greeting}</p>
        {view.note ? (
          <p className="mt-1 text-base text-destructive">{view.note}</p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── SELF-PORTRAIT: radar + taste-space scatter ── */}
        <section className="order-1 space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              portrait of your ear {isDemo ? "· (demo is teaching itself)" : ""}
            </p>
            <RadarPortrait axes={view.axes} reduced={view.reduced} />
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              taste space · density × register
            </p>
            <ScatterField scatter={view.scatter} axes={view.axes} />
          </div>
        </section>

        {/* ── controls, meter, current phrase, stats ── */}
        <section className="order-2 space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              knows-your-ear
            </p>
            <AccuracyGauge accuracy={view.accuracy} predictions={view.predictions} />
            <p className="mt-2 text-base text-muted-foreground">
              Before you choose, it predicts your bit. This is the share it has
              gotten right lately.
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              now proposing
            </p>
            <PhraseGlyph phrase={view.current} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => eng.current?.keep()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Keep · K
            </button>
            <button
              type="button"
              onClick={() => eng.current?.pass()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Pass · J / P
            </button>
            <button
              type="button"
              onClick={() => eng.current?.skip()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Next · Space
            </button>
            <button
              type="button"
              onClick={() => eng.current?.enableSound()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {view.soundOn ? "Sound on" : "Enable sound"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => eng.current?.reset()}
            className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Reset my ear · R
          </button>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="kept" value={view.kept} />
            <Stat label="passed" value={view.passed} />
            <Stat label="visits" value={view.sessions} />
          </dl>

          <p className="text-base text-muted-foreground">
            Keyboard is primary: <span className="font-mono">K</span> keep,{" "}
            <span className="font-mono">J</span>/<span className="font-mono">P</span>{" "}
            pass, <span className="font-mono">Space</span> next,{" "}
            <span className="font-mono">R</span> reset. Buttons work too.
          </p>
        </section>
      </div>
    </main>
  );
}

// ── inline-SVG art layer (raw hex ok; each panel paints its own parchment) ────

function RadarPortrait({ axes, reduced }: { axes: number[]; reduced: boolean }) {
  const cx = 160;
  const cy = 160;
  const R = 116;
  const n = FEATURE_DIM;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const rings = [0.25, 0.5, 0.75, 1].map((rr) => {
    const pts = Array.from({ length: n }, (_, i) => {
      const [x, y] = polar(cx, cy, R * rr, angle(i));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return pts;
  });

  const idealPts = axes
    .map((v, i) => {
      const [x, y] = polar(cx, cy, R * Math.max(0.02, v), angle(i));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 320 320"
      className="mx-auto block w-full max-w-[340px]"
      role="img"
      aria-label="Radar portrait of the eight-axis learned taste model"
    >
      <rect x="0" y="0" width="320" height="320" rx="10" fill={PAPER} stroke={PAPER_EDGE} />
      {rings.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={i === rings.length - 1 ? 1.1 : 0.6}
          opacity={i === rings.length - 1 ? 0.5 : 0.28}
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = polar(cx, cy, R, angle(i));
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x.toFixed(1)}
            y2={y.toFixed(1)}
            stroke={INK_SOFT}
            strokeWidth={0.5}
            opacity={0.25}
          />
        );
      })}
      <polygon
        points={idealPts}
        fill={EMBER}
        fillOpacity={0.22}
        stroke={EMBER}
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ transition: reduced ? "none" : "all 120ms linear" }}
      />
      {axes.map((v, i) => {
        const [x, y] = polar(cx, cy, R * Math.max(0.02, v), angle(i));
        return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill={EMBER} />;
      })}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = polar(cx, cy, R + 16, angle(i));
        const anchor = x < cx - 8 ? "end" : x > cx + 8 ? "start" : "middle";
        return (
          <text
            key={i}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            fontSize="11"
            fontFamily="ui-monospace, monospace"
            fill={INK}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {ABBREV[i]}
          </text>
        );
      })}
      <circle cx={cx} cy={cy} r={2} fill={INK} />
    </svg>
  );
}

function ScatterField({ scatter, axes }: { scatter: ScatterPt[]; axes: number[] }) {
  const W = 320;
  const H = 220;
  const pad = 30;
  const px = (v: number) => pad + v * (W - 2 * pad);
  const py = (v: number) => H - pad - v * (H - 2 * pad); // register up

  const idealX = px(axes[SCATTER_X]);
  const idealY = py(axes[SCATTER_Y]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto block w-full max-w-[340px]"
      role="img"
      aria-label="Scatter of recent phrases in taste space: kept in ember, passed faded"
    >
      <rect x="0" y="0" width={W} height={H} rx="10" fill={PAPER} stroke={PAPER_EDGE} />
      {/* axes */}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={INK_SOFT} strokeWidth={0.8} opacity={0.5} />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke={INK_SOFT} strokeWidth={0.8} opacity={0.5} />
      <text x={W - pad} y={H - pad + 16} fontSize="10" fontFamily="ui-monospace, monospace" fill={INK_SOFT} textAnchor="end">
        density →
      </text>
      <text x={pad - 6} y={pad - 8} fontSize="10" fontFamily="ui-monospace, monospace" fill={INK_SOFT} textAnchor="start">
        register ↑
      </text>
      {/* current learned centroid */}
      <circle cx={idealX} cy={idealY} r={13} fill="none" stroke={EMBER} strokeWidth={1.4} opacity={0.7} />
      <circle cx={idealX} cy={idealY} r={2.5} fill={EMBER} />
      {/* recent phrase glyphs, older = fainter */}
      {scatter.map((p, i) => {
        const age = (i + 1) / scatter.length; // newest → 1
        const cxp = px(p.x);
        const cyp = py(p.y);
        return p.kept ? (
          <circle key={i} cx={cxp} cy={cyp} r={5} fill={KEPT} opacity={0.35 + 0.6 * age} />
        ) : (
          <circle
            key={i}
            cx={cxp}
            cy={cyp}
            r={4}
            fill="none"
            stroke={PASSED}
            strokeWidth={1.3}
            opacity={0.25 + 0.4 * age}
          />
        );
      })}
    </svg>
  );
}

function AccuracyGauge({ accuracy, predictions }: { accuracy: number; predictions: number }) {
  const r = 46;
  const C = 2 * Math.PI * r;
  const dash = C * accuracy;
  const pct = Math.round(accuracy * 100);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" role="img" aria-label={`Accuracy ${pct} percent`}>
        <rect x="0" y="0" width="120" height="120" rx="10" fill={PAPER} stroke={PAPER_EDGE} />
        <circle cx="60" cy="60" r={r} fill="none" stroke={INK_SOFT} strokeWidth={9} opacity={0.28} />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={EMBER}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} ${C.toFixed(1)}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" fontSize="24" fontFamily="ui-monospace, monospace" fill={INK} textAnchor="middle">
          {pct}%
        </text>
        <text x="60" y="76" fontSize="10" fontFamily="ui-monospace, monospace" fill={INK_SOFT} textAnchor="middle">
          {predictions}/{ACC_WINDOW}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-base text-foreground">
          It read you right in <span className="font-medium">{pct}%</span> of the last{" "}
          {predictions || 0} phrases.
        </p>
      </div>
    </div>
  );
}

function PhraseGlyph({ phrase }: { phrase: Phrase | null }) {
  const W = 320;
  const H = 96;
  const pad = 8;
  if (!phrase || phrase.notes.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="No phrase yet">
        <rect x="0" y="0" width={W} height={H} rx="10" fill={PAPER} stroke={PAPER_EDGE} />
        <text x={W / 2} y={H / 2} fontSize="12" fontFamily="ui-monospace, monospace" fill={INK_SOFT} textAnchor="middle" dominantBaseline="middle">
          …
        </text>
      </svg>
    );
  }
  const midis = phrase.notes.map((nn) => nn.midi);
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  const span = Math.max(hi - lo, 4);
  const cellW = (W - 2 * pad) / phrase.steps;
  const yOf = (m: number) => pad + (1 - (m - lo) / span) * (H - 2 * pad);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Piano-roll of the proposed phrase">
      <rect x="0" y="0" width={W} height={H} rx="10" fill={PAPER} stroke={PAPER_EDGE} />
      {/* beat gridlines */}
      {Array.from({ length: phrase.steps / 4 + 1 }, (_, i) => {
        const x = pad + i * 4 * cellW;
        return <line key={i} x1={x} y1={pad} x2={x} y2={H - pad} stroke={INK_SOFT} strokeWidth={0.5} opacity={0.22} />;
      })}
      {phrase.notes.map((nn, i) => {
        const x = pad + nn.step * cellW;
        const y = yOf(nn.midi);
        return (
          <rect
            key={i}
            x={x + 1}
            y={y - 4}
            width={Math.max(cellW - 2, 3)}
            height={8}
            rx={3}
            fill={EMBER}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 py-2">
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
    </div>
  );
}
