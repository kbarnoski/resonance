"use client";

// ── 3192-bow ──────────────────────────────────────────────────────────────
// "What if the screen taught you to BOW a string — controlling bow speed and
//  pressure as a 2-D gesture, where too little force whispers, too much force
//  screeches, and only the right zone sings?"
//
// INPUT  : pointer 2-D bow gesture (horizontal = bow speed, vertical = bow
//          force) drawn directly ON a Schelleng playability diagram, plus
//          key / button open-string pitch select.
// OUTPUT : SVG — the Schelleng wedge with a live gesture cursor, and a live
//          Helmholtz-corner string animation. Sound via Web Audio (AudioWorklet
//          bowed-string friction waveguide, ScriptProcessor fallback).
// ENGINE : McIntyre–Woodhouse–Schumacher stick–slip friction driving a digital
//          waveguide (see string.ts / worklet-source.ts).
// VIBE   : instrument-craft · decision-stakes.
//
// Named references:
//   McIntyre, Woodhouse & Schumacher, "On the oscillations of musical
//     instruments" (JASA 74, 1983) — the friction-driven bowed-string model.
//   Schelleng, "The bowed string and the player" (JASA 53, 1973) — the
//     bow-force / bow-motion playability wedge rendered here.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyRegime,
  bowParamsFor,
  makeCurvePoints,
  makeWedgePolygon,
  minForce,
  maxForce,
  clamp01,
  REGIME_COPY,
  type Regime,
} from "./schelleng";
import { BowEngine, type AudioBackend } from "./string";

// ── Seeded PRNG (mulberry32) — no Math.random / Date ────────────────────────
function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic auto-bow wobble, seeded with mulberry32(0x3192) at load — the
// phase offsets, amplitudes and rates below all come from that one PRNG, so the
// self-demo is byte-identical every run (no Math.random / Date).
const AUTO_RNG = makeMulberry32(0x3192);
const WOBBLE = {
  p1: AUTO_RNG() * Math.PI * 2,
  p2: AUTO_RNG() * Math.PI * 2,
  a1: 0.02 + AUTO_RNG() * 0.025,
  a2: 0.015 + AUTO_RNG() * 0.02,
  r1: 1.3 + AUTO_RNG() * 0.8,
  r2: 1.8 + AUTO_RNG() * 0.9,
};

// ── Open strings (fixed tuning — pitch is the discrete choice) ─────────────
const OPEN_STRINGS = [
  { name: "G3", freq: 196.0 },
  { name: "D4", freq: 293.66 },
  { name: "A4", freq: 440.0 },
  { name: "E5", freq: 659.25 },
] as const;

// ── SVG geometry ───────────────────────────────────────────────────────────
const DIAG_W = 1000;
const DIAG_H = 560;
const STR_W = 1000;
const STR_H = 320;
const STR_MID = STR_H / 2;
const STR_MAXDISP = 120;
const STR_N = 140;

// Regime → art colors (raw hex allowed inside SVG art only)
const REGIME_COLOR: Record<Regime, string> = {
  surface: "#6366f1", // dim indigo — thin, unresolved
  singing: "#a78bfa", // violet — the good zone
  raucous: "#fb6b78", // red — the failure
};

type Phase = "auto" | "live";
type AudioStatus = "off" | "on" | "error";

// smoothstep between two keyframes
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Deterministic auto-bow gesture path in [0,1] loop time → (speed, force).
// surface (light) → sweep into the singing wedge → push into raucous → back.
const AUTO_KEYS: { t: number; sx: number; fy: number }[] = [
  { t: 0.0, sx: 0.42, fy: 0.1 },
  { t: 0.18, sx: 0.45, fy: 0.13 },
  { t: 0.3, sx: 0.42, fy: 0.48 },
  { t: 0.52, sx: 0.5, fy: 0.52 },
  { t: 0.64, sx: 0.55, fy: 0.9 },
  { t: 0.76, sx: 0.5, fy: 0.9 },
  { t: 0.88, sx: 0.42, fy: 0.5 },
  { t: 1.0, sx: 0.42, fy: 0.1 },
];

function sampleAutoPath(t: number): { sx: number; fy: number } {
  let i = 0;
  while (i < AUTO_KEYS.length - 1 && AUTO_KEYS[i + 1].t < t) i++;
  const a = AUTO_KEYS[i];
  const b = AUTO_KEYS[Math.min(i + 1, AUTO_KEYS.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  const k = smoothstep(clamp01((t - a.t) / span));
  return { sx: a.sx + (b.sx - a.sx) * k, fy: a.fy + (b.fy - a.fy) * k };
}

interface Gesture {
  sx: number;
  fy: number;
  active: boolean;
}

// Build the SVG points string for the string displacement given its state.
function makeStringPoints(
  regime: Regime,
  amp: number, // 0..1 captured envelope
  corner: number, // apex position 0..1
  clock: number, // seconds, for texture animation
  jitterSeed: () => number,
): string {
  const pts: string[] = [];
  for (let i = 0; i < STR_N; i++) {
    const x = i / (STR_N - 1);
    // base Helmholtz "tent": two straight segments meeting at the corner
    const tent = x < corner ? x / Math.max(1e-3, corner) : (1 - x) / Math.max(1e-3, 1 - corner);
    let d = tent * amp;
    if (regime === "surface") {
      // never captures: a thin, high-frequency surface ripple
      d += 0.09 * Math.sin(x * 46 + clock * 24) * (0.4 + 0.6 * x * (1 - x));
    } else if (regime === "raucous") {
      // irregular slip: jagged, jittering corner + secondary kinks
      d += (jitterSeed() - 0.5) * 0.22 * amp;
      d += 0.12 * amp * Math.sin(x * 17 + clock * 9);
    }
    const y = STR_MID - d * STR_MAXDISP;
    pts.push(`${(x * STR_W).toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export default function BowPage() {
  const [phase, setPhase] = useState<Phase>("auto");
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("off");
  const [backend, setBackend] = useState<AudioBackend>("none");
  const [stringIdx, setStringIdx] = useState(0);
  const [regime, setRegime] = useState<Regime | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const engineRef = useRef<BowEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const gestureRef = useRef<Gesture>({ sx: 0.42, fy: 0.1, active: false });
  const phaseRef = useRef<Phase>("auto");
  const ampRef = useRef(0);
  const cornerPhaseRef = useRef(0);
  const lastTimeRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastRegimeRef = useRef<Regime | null>(null);
  const noiseRef = useRef(0x31920b7d >>> 0);

  // SVG element refs (updated imperatively to avoid per-frame React renders)
  const cursorRef = useRef<SVGGElement | null>(null);
  const cursorDotRef = useRef<SVGCircleElement | null>(null);
  const stringPathRef = useRef<SVGPolylineElement | null>(null);
  const stringGlowRef = useRef<SVGPolylineElement | null>(null);
  const cornerDotRef = useRef<SVGCircleElement | null>(null);
  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const diagRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // cheap per-frame noise for raucous jitter (deterministic-ish)
  const frameNoise = useCallback((): number => {
    let x = noiseRef.current;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    noiseRef.current = x >>> 0;
    return noiseRef.current / 0xffffffff;
  }, []);

  // ── Start audio (must be inside a user gesture) ───────────────────────────
  const startAudio = useCallback(async () => {
    if (audioStatus === "on") return;
    let engine = engineRef.current;
    if (!engine) {
      engine = new BowEngine();
      engine.setFrequency(OPEN_STRINGS[stringIdx].freq);
      engineRef.current = engine;
    }
    try {
      const b = await engine.start();
      setBackend(b);
      setAudioStatus(b === "none" ? "error" : "on");
    } catch {
      setAudioStatus("error");
    }
  }, [audioStatus, stringIdx]);

  const pickUpBow = useCallback(async () => {
    setPhase("live");
    phaseRef.current = "live";
    gestureRef.current.active = false;
    await startAudio();
  }, [startAudio]);

  const playAutoWithSound = useCallback(async () => {
    await startAudio();
  }, [startAudio]);

  // ── Pointer → bow gesture ─────────────────────────────────────────────────
  const pointerToGesture = useCallback((clientX: number, clientY: number) => {
    const svg = diagRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    gestureRef.current.sx = clamp01((clientX - rect.left) / rect.width);
    gestureRef.current.fy = clamp01((clientY - rect.top) / rect.height);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      if (phaseRef.current === "auto") {
        setPhase("live");
        phaseRef.current = "live";
        void startAudio();
      }
      pointerToGesture(e.clientX, e.clientY);
      gestureRef.current.active = true;
    },
    [pointerToGesture, startAudio],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!gestureRef.current.active) return;
      pointerToGesture(e.clientX, e.clientY);
    },
    [pointerToGesture],
  );

  const handlePointerUp = useCallback(() => {
    gestureRef.current.active = false;
  }, []);

  // ── Pitch select ──────────────────────────────────────────────────────────
  const selectString = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(OPEN_STRINGS.length - 1, idx));
    setStringIdx(clamped);
    engineRef.current?.setFrequency(OPEN_STRINGS[clamped].freq);
  }, []);

  // keyboard: arrows / number keys pick the string
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setStringIdx((i) => {
          const n = Math.min(OPEN_STRINGS.length - 1, i + 1);
          engineRef.current?.setFrequency(OPEN_STRINGS[n].freq);
          return n;
        });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setStringIdx((i) => {
          const n = Math.max(0, i - 1);
          engineRef.current?.setFrequency(OPEN_STRINGS[n].freq);
          return n;
        });
      } else if (e.key >= "1" && e.key <= "4") {
        const n = parseInt(e.key, 10) - 1;
        setStringIdx(n);
        engineRef.current?.setFrequency(OPEN_STRINGS[n].freq);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Render loop (visuals always run; audio joins on gesture) ──────────────
  useEffect(() => {
    startTimeRef.current = performance.now();
    lastTimeRef.current = startTimeRef.current;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      // resolve current gesture
      const g = gestureRef.current;
      if (phaseRef.current === "auto") {
        const T = 15; // seconds per demo loop
        const elapsed = (now - startTimeRef.current) / 1000;
        const tt = (elapsed % T) / T;
        const p = sampleAutoPath(tt);
        // gentle organic wobble — offsets/rates seeded from mulberry32(0x3192)
        g.sx = clamp01(p.sx + WOBBLE.a1 * Math.sin(elapsed * WOBBLE.r1 + WOBBLE.p1));
        g.fy = clamp01(p.fy + WOBBLE.a2 * Math.sin(elapsed * WOBBLE.r2 + WOBBLE.p2));
        g.active = true;
      }

      const active = g.active;
      const reg: Regime = classifyRegime(g.sx, g.fy);

      // drive the synth from the friction knobs
      const bp = bowParamsFor(g.sx, g.fy);
      engineRef.current?.setParams({
        maxVel: bp.maxVel,
        slope: bp.slope,
        force: g.fy,
        active,
      });

      // regime readout (only re-render on change)
      const shownReg = active ? reg : null;
      if (shownReg !== lastRegimeRef.current) {
        lastRegimeRef.current = shownReg;
        setRegime(shownReg);
      }

      // ── update Schelleng cursor ──
      const cx = g.sx * DIAG_W;
      const cy = g.fy * DIAG_H;
      if (cursorRef.current) {
        cursorRef.current.setAttribute("transform", `translate(${cx},${cy})`);
        cursorRef.current.style.opacity = active ? "1" : "0.35";
      }
      if (cursorDotRef.current) {
        cursorDotRef.current.setAttribute(
          "fill",
          active ? REGIME_COLOR[reg] : "#8a8a93",
        );
      }

      // ── update captured amplitude (string "locks in" over time) ──
      let target = 0;
      if (active) {
        if (reg === "singing") target = 0.92;
        else if (reg === "surface") target = 0.16;
        else target = 0.78; // raucous
      }
      const k = 1 - Math.exp(-dt * (reg === "singing" ? 5 : 9));
      ampRef.current += (target - ampRef.current) * k;

      // ── traveling Helmholtz corner ──
      const cornerRate = 0.9 + g.sx * 1.8; // visible sweep, scaled by speed
      cornerPhaseRef.current = (cornerPhaseRef.current + dt * cornerRate) % 1;
      // triangle wave so the corner sweeps back and forth
      const tp = cornerPhaseRef.current;
      const corner = 0.08 + 0.84 * (tp < 0.5 ? tp * 2 : 2 - tp * 2);

      const clock = now / 1000;
      const drawReg: Regime = active ? reg : "surface";
      const pts = makeStringPoints(
        drawReg,
        ampRef.current,
        corner,
        clock,
        frameNoise,
      );
      const col = active ? REGIME_COLOR[reg] : "#4b4b52";
      if (stringPathRef.current) {
        stringPathRef.current.setAttribute("points", pts);
        stringPathRef.current.setAttribute("stroke", col);
      }
      if (stringGlowRef.current) {
        stringGlowRef.current.setAttribute("points", pts);
        stringGlowRef.current.setAttribute("stroke", col);
        stringGlowRef.current.style.opacity = (
          0.15 +
          0.45 * ampRef.current
        ).toFixed(3);
      }
      if (cornerDotRef.current) {
        const apexY = STR_MID - ampRef.current * STR_MAXDISP;
        cornerDotRef.current.setAttribute("cx", (corner * STR_W).toFixed(1));
        cornerDotRef.current.setAttribute("cy", apexY.toFixed(1));
        cornerDotRef.current.setAttribute("fill", col);
        cornerDotRef.current.style.opacity =
          active && reg === "singing" ? "1" : "0.4";
      }

      // ── level meter (real audio RMS when playing) ──
      if (levelBarRef.current) {
        const rms = engineRef.current?.rms ?? 0;
        levelBarRef.current.style.width = `${Math.min(100, rms * 140).toFixed(1)}%`;
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [frameNoise]);

  // ── Teardown audio on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      void engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // Static SVG geometry (computed once)
  const wedgePoly = makeWedgePolygon(DIAG_W, DIAG_H);
  const minCurve = makeCurvePoints(minForce, DIAG_W, DIAG_H);
  const maxCurve = makeCurvePoints(maxForce, DIAG_W, DIAG_H);

  const regInfo = regime ? REGIME_COPY[regime] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bow the string
          </h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            Drag across the diagram to bow — sideways is speed, down is
            pressure. Too little force whispers, too much screeches; only the
            wedge sings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              phase === "auto" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {phase === "auto" ? "● auto" : "live"}
          </span>
          <button
            onClick={() => setNotesOpen(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {/* ── Tags ── */}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          "input: 2-D bow gesture",
          "output: SVG",
          "technique: stick–slip friction waveguide",
          "vibe: instrument-craft",
        ].map((t) => (
          <span
            key={t}
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t}
          </span>
        ))}
      </div>

      {/* ── Panels ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Schelleng diagram = the bow strip */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Schelleng diagram
            </span>
            <span className="font-mono text-xs text-muted-foreground/70">
              bow here
            </span>
          </div>
          <svg
            ref={diagRef}
            viewBox={`0 0 ${DIAG_W} ${DIAG_H}`}
            className="w-full touch-none rounded-lg border border-border bg-[#0b0713] [cursor:crosshair]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="application"
            aria-label="Schelleng bowing diagram — drag to bow the string"
          >
            {/* subtle grid */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={`h${f}`}
                x1={0}
                y1={f * DIAG_H}
                x2={DIAG_W}
                y2={f * DIAG_H}
                stroke="#241147"
                strokeWidth={1}
              />
            ))}
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={`v${f}`}
                x1={f * DIAG_W}
                y1={0}
                x2={f * DIAG_W}
                y2={DIAG_H}
                stroke="#241147"
                strokeWidth={1}
              />
            ))}

            {/* the singing wedge */}
            <polygon points={wedgePoly} fill="#8b5cf6" fillOpacity={0.16} />
            <polyline
              points={minCurve}
              fill="none"
              stroke="#6366f1"
              strokeWidth={2.5}
              strokeOpacity={0.8}
            />
            <polyline
              points={maxCurve}
              fill="none"
              stroke="#fb6b78"
              strokeWidth={2.5}
              strokeOpacity={0.8}
            />

            {/* region labels */}
            <text x={24} y={44} fill="#6366f1" fontSize={22} fontFamily="monospace">
              surface — too light
            </text>
            <text
              x={24}
              y={DIAG_H / 2 + 8}
              fill="#c4b5fd"
              fontSize={24}
              fontFamily="monospace"
            >
              singing
            </text>
            <text
              x={24}
              y={DIAG_H - 24}
              fill="#fb6b78"
              fontSize={22}
              fontFamily="monospace"
            >
              raucous — too hard
            </text>

            {/* axis hints */}
            <text
              x={DIAG_W - 16}
              y={DIAG_H - 14}
              fill="#8a8a93"
              fontSize={18}
              fontFamily="monospace"
              textAnchor="end"
            >
              bow speed →
            </text>
            <text
              x={14}
              y={DIAG_H - 60}
              fill="#8a8a93"
              fontSize={18}
              fontFamily="monospace"
              transform={`rotate(-90 14 ${DIAG_H - 60})`}
            >
              bow force ↓
            </text>

            {/* live gesture cursor */}
            <g ref={cursorRef} transform="translate(420,56)">
              <line x1={-26} y1={0} x2={26} y2={0} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={1.5} />
              <line x1={0} y1={-26} x2={0} y2={26} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={1.5} />
              <circle ref={cursorDotRef} cx={0} cy={0} r={11} fill="#8a8a93" />
            </g>
          </svg>
        </section>

        {/* Live string / Helmholtz corner */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              the string
            </span>
            <span
              className={`font-mono text-xs uppercase tracking-[0.18em] ${
                regime === "singing"
                  ? "text-primary"
                  : regime === "raucous"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {regInfo ? regInfo.label : "— lifted —"}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${STR_W} ${STR_H}`}
            className="w-full rounded-lg border border-border bg-[#0b0713]"
            aria-label="Live string displacement — the traveling Helmholtz corner"
          >
            <defs>
              <filter id="bowGlow" x="-20%" y="-60%" width="140%" height="220%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>
            {/* nut + bridge terminations */}
            <circle cx={0} cy={STR_MID} r={7} fill="#3a1d78" />
            <circle cx={STR_W} cy={STR_MID} r={7} fill="#3a1d78" />
            <line
              x1={0}
              y1={STR_MID}
              x2={STR_W}
              y2={STR_MID}
              stroke="#241147"
              strokeWidth={1}
            />
            <polyline
              ref={stringGlowRef}
              points=""
              fill="none"
              stroke="#a78bfa"
              strokeWidth={9}
              strokeLinejoin="round"
              filter="url(#bowGlow)"
              style={{ opacity: 0.3 }}
            />
            <polyline
              ref={stringPathRef}
              points=""
              fill="none"
              stroke="#a78bfa"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            <circle ref={cornerDotRef} cx={100} cy={STR_MID} r={7} fill="#a78bfa" />
          </svg>

          {/* readout */}
          <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">
            {regInfo ? (
              <>
                <span
                  className={
                    regime === "singing"
                      ? "text-primary"
                      : regime === "raucous"
                        ? "text-destructive"
                        : "text-foreground"
                  }
                >
                  {regInfo.label}
                </span>{" "}
                — {regInfo.hint}
              </>
            ) : (
              "The bow is off the string. Drag on the diagram to bow."
            )}
          </p>
        </section>
      </div>

      {/* ── Controls ── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={pickUpBow}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Pick up the bow
        </button>
        {phase === "auto" && (
          <button
            onClick={playAutoWithSound}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Play the auto-demo with sound
          </button>
        )}

        {/* String selector */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            string
          </span>
          {OPEN_STRINGS.map((s, i) => (
            <button
              key={s.name}
              onClick={() => selectString(i)}
              aria-pressed={i === stringIdx}
              className={`min-h-[44px] rounded-md border px-3 text-sm font-mono transition-colors ${
                i === stringIdx
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
          <span className="font-mono text-xs text-muted-foreground/70">
            ← → or 1–4
          </span>
        </div>

        {/* Level meter */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            level
          </span>
          <div className="h-2 w-28 overflow-hidden rounded-full border border-border bg-background">
            <div
              ref={levelBarRef}
              className="h-full bg-primary/70"
              style={{ width: "0%" }}
            />
          </div>
        </div>
      </div>

      {/* audio status line */}
      <p className="mt-3 text-sm text-muted-foreground">
        {audioStatus === "off" &&
          "Visuals are running the seeded auto-bow now — surface, then singing, then raucous. Browsers hold sound until you click, so press a button to hear it."}
        {audioStatus === "on" &&
          `Sound on (${backend === "worklet" ? "AudioWorklet" : "ScriptProcessor"}). ${
            phase === "live"
              ? "You have the bow — drag on the diagram."
              : "Auto-bow is playing hands-free."
          }`}
        {audioStatus === "error" &&
          "Audio could not start on this device — the SVG still shows the full stick–slip story."}
      </p>

      {/* ── Design notes overlay ── */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Design notes — Bow the string
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Bowing is a skill because the string&apos;s physics forgives
                nothing. Under the diagram runs a digital-waveguide bowed string
                driven by a nonlinear stick–slip friction junction — the
                McIntyre–Woodhouse–Schumacher model. Each sample the junction
                reads the relative velocity between bow and string and a friction
                curve decides whether the string sticks to the bow or slips free.
                The stick↔slip alternation is Helmholtz motion; it is the tone.
              </p>
              <p>
                Your gesture feeds two knobs: horizontal position is bow speed
                (the bow&apos;s velocity), vertical position is bow force (the
                width of the friction capture region). With too little force the
                string never captures — a thin surface whistle. With too much,
                the release turns irregular — a raucous crunch. Between them the
                string locks into a steady singing tone. It is a friction
                nonlinearity doing this, not a filter sweep.
              </p>
              <p>
                The plot is J.C. Schelleng&apos;s playability diagram: a minimum
                bow-force curve (rises with speed) and a maximum bow-force curve
                (falls with speed) bound a wedge. Inside = singing, below =
                surface, above = raucous. The wedge narrows as you bow faster —
                fast bowing is unforgiving — and your live cursor shows exactly
                where your gesture sits. That is the musical decision you can get
                wrong.
              </p>
              <p>
                The right panel draws the string&apos;s displacement as an SVG
                polyline: watch the Helmholtz corner travel and the string
                &quot;capture&quot; when you enter the wedge, ripple thinly when
                you fall below it, and jitter when you press too hard.
              </p>
              <p className="text-foreground">References</p>
              <p>
                McIntyre, Woodhouse &amp; Schumacher, &ldquo;On the oscillations
                of musical instruments,&rdquo; <em>JASA</em> 74(5), 1983 — the
                friction-driven bowed-string model. · Schelleng, &ldquo;The
                bowed string and the player,&rdquo; <em>JASA</em> 53(1), 1973 —
                the playability wedge rendered here.
              </p>
              <p className="text-muted-foreground/70">
                Caveat: the friction constants are physically shaped but tuned by
                eye, not ear — a real listening pass would refine where each
                regime bites. Master gain is held ≤ 0.15 behind a limiter so a
                raucous bow can never blast.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
