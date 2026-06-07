"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createOnsetDetector } from "./onset";
import { createSteadinessTracker } from "./steadiness";
import { createSteadyAudio } from "./audio";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppState = "idle" | "running" | "denied" | "demo";

interface CreatureState {
  x: number;           // 0..1 along path
  bodyBob: number;     // 0..1 oscillating body bob
  leftLegAngle: number;
  rightLegAngle: number;
  wobble: number;      // body tilt, degrees
  isHopping: boolean;
  hopFrame: number;    // 0..1 animation progress
  stepCount: number;
  steadiness: number;  // 0..1
  tempo: number;       // BPM, 0 if not yet
}

interface Flower {
  id: number;
  x: number;           // 0..1 path position
  bloom: number;       // 0..1 bloom progress
}

interface FootprintMark {
  id: number;
  x: number;
  side: "left" | "right";
  opacity: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PATH_Y = 68;     // % from top where path center is
const CREATURE_VIEW_X = 30; // % across screen the creature stays
const STEPS_FOR_REWARD = 8;
const DEMO_SCRIPT: Array<{ ioi: number; count: number }> = [
  // steady: ~600ms IOI (100 BPM)
  { ioi: 600, count: 8 },
  // wobbly: vary IOI
  { ioi: 400, count: 2 },
  { ioi: 900, count: 2 },
  { ioi: 350, count: 2 },
  { ioi: 850, count: 2 },
  // re-steady
  { ioi: 580, count: 10 },
];

// ─── SVG helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

// ─── Creature SVG ────────────────────────────────────────────────────────────

interface CreatureSVGProps {
  cx: number;         // center x in SVG coords
  cy: number;         // center y
  steadiness: number; // 0..1
  leftLegAngle: number;
  rightLegAngle: number;
  wobble: number;
  bodyBob: number;
  isHopping: boolean;
  hopFrame: number;
}

function CreatureSVG({
  cx, cy, steadiness, leftLegAngle, rightLegAngle,
  wobble, bodyBob, isHopping, hopFrame,
}: CreatureSVGProps) {
  const bodyRadius = 22;
  const hopLift = isHopping ? Math.sin(hopFrame * Math.PI) * 28 : 0;
  const actualCy = cy - hopLift - bodyBob * 2;

  // Color shifts toward wobble / steadiness
  const bodyHue = lerp(280, 200, steadiness); // violet → cyan
  const bodyColor = `hsl(${bodyHue},70%,${lerp(45, 65, steadiness)}%)`;
  const eyeColor = steadiness > 0.7 ? "#fff" : "#fde68a";

  const legLen = 18;
  // left leg
  const lx1 = cx - 10;
  const ly1 = actualCy + bodyRadius;
  const lx2 = lx1 + Math.sin((leftLegAngle * Math.PI) / 180) * legLen;
  const ly2 = ly1 + Math.cos((leftLegAngle * Math.PI) / 180) * legLen;
  // right leg
  const rx1 = cx + 10;
  const ry1 = actualCy + bodyRadius;
  const rx2 = rx1 + Math.sin((rightLegAngle * Math.PI) / 180) * legLen;
  const ry2 = ry1 + Math.cos((rightLegAngle * Math.PI) / 180) * legLen;

  const wobbleRad = wobble;

  return (
    <g transform={`rotate(${wobbleRad}, ${cx}, ${actualCy})`}>
      {/* Shadow */}
      <ellipse
        cx={cx}
        cy={cy + bodyRadius + legLen + 2}
        rx={lerp(20, 14, hopLift / 28)}
        ry={4}
        fill="rgba(0,0,0,0.25)"
      />
      {/* Legs */}
      <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
        stroke={bodyColor} strokeWidth={6} strokeLinecap="round" />
      <line x1={rx1} y1={ry1} x2={rx2} y2={ry2}
        stroke={bodyColor} strokeWidth={6} strokeLinecap="round" />
      {/* Feet */}
      <ellipse cx={lx2} cy={ly2} rx={7} ry={4}
        fill={bodyColor} transform={`rotate(${leftLegAngle}, ${lx2}, ${ly2})`} />
      <ellipse cx={rx2} cy={ry2} rx={7} ry={4}
        fill={bodyColor} transform={`rotate(${rightLegAngle}, ${rx2}, ${ry2})`} />
      {/* Body */}
      <circle cx={cx} cy={actualCy} r={bodyRadius} fill={bodyColor} />
      {/* Spots (steady = clear spots, unsteady = blurry) */}
      {steadiness > 0.4 && (
        <>
          <circle cx={cx - 7} cy={actualCy - 4} r={5}
            fill="rgba(255,255,255,0.18)" />
          <circle cx={cx + 9} cy={actualCy + 6} r={3.5}
            fill="rgba(255,255,255,0.14)" />
        </>
      )}
      {/* Eyes */}
      <circle cx={cx - 8} cy={actualCy - 8} r={5} fill={eyeColor} />
      <circle cx={cx + 8} cy={actualCy - 8} r={5} fill={eyeColor} />
      <circle cx={cx - 7} cy={actualCy - 8} r={2.5} fill="#1e1b4b" />
      <circle cx={cx + 9} cy={actualCy - 8} r={2.5} fill="#1e1b4b" />
      {/* Smile when steady */}
      {steadiness > 0.6 ? (
        <path
          d={`M ${cx - 7} ${actualCy - 1} Q ${cx} ${actualCy + 7} ${cx + 7} ${actualCy - 1}`}
          stroke={eyeColor} strokeWidth={2} fill="none" strokeLinecap="round"
        />
      ) : (
        <path
          d={`M ${cx - 7} ${actualCy + 5} Q ${cx} ${actualCy - 1} ${cx + 7} ${actualCy + 5}`}
          stroke="#fbbf24" strokeWidth={2} fill="none" strokeLinecap="round"
        />
      )}
      {/* Ears */}
      <circle cx={cx - 18} cy={actualCy - 18} r={9} fill={bodyColor} />
      <circle cx={cx + 18} cy={actualCy - 18} r={9} fill={bodyColor} />
      <circle cx={cx - 18} cy={actualCy - 18} r={5}
        fill={`hsl(${bodyHue},60%,55%)`} />
      <circle cx={cx + 18} cy={actualCy - 18} r={5}
        fill={`hsl(${bodyHue},60%,55%)`} />
      {/* Hop sparkles */}
      {isHopping && hopFrame > 0.3 && hopFrame < 0.9 && (
        <>
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const dist = hopFrame * 30;
            const sx = cx + Math.cos((angle * Math.PI) / 180) * dist;
            const sy = actualCy + Math.sin((angle * Math.PI) / 180) * dist;
            return (
              <circle key={angle} cx={sx} cy={sy} r={3}
                fill="#a5f3fc" opacity={1 - hopFrame} />
            );
          })}
        </>
      )}
    </g>
  );
}

// ─── Flower SVG ──────────────────────────────────────────────────────────────

function FlowerSVG({ cx, cy, bloom }: { cx: number; cy: number; bloom: number }) {
  const size = bloom * 14;
  const petalColors = ["#f9a8d4", "#fde68a", "#a5f3fc", "#bbf7d0", "#c4b5fd"];
  return (
    <g opacity={Math.min(1, bloom * 2)}>
      {/* Stem */}
      <line x1={cx} y1={cy} x2={cx} y2={cy + 18 * bloom}
        stroke="#86efac" strokeWidth={2} strokeLinecap="round" />
      {/* Petals */}
      {petalColors.map((color, i) => {
        const angle = (i * 72 * Math.PI) / 180;
        const px = cx + Math.cos(angle) * size;
        const py = cy + Math.sin(angle) * size;
        return (
          <circle key={i} cx={px} cy={py} r={size * 0.45}
            fill={color} opacity={0.9} />
        );
      })}
      {/* Center */}
      <circle cx={cx} cy={cy} r={size * 0.38} fill="#fef08a" />
    </g>
  );
}

// ─── Steadiness Meter ────────────────────────────────────────────────────────

function SteadinessMeter({ steadiness, tempo }: { steadiness: number; tempo: number }) {
  const bars = 12;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1 items-end h-10">
        {Array.from({ length: bars }, (_, i) => {
          const threshold = i / bars;
          const lit = steadiness >= threshold;
          const color = lit
            ? i < 4 ? "#f87171" : i < 8 ? "#fbbf24" : "#34d399"
            : "rgba(255,255,255,0.12)";
          const height = 4 + (i / bars) * 32;
          return (
            <div key={i}
              style={{
                width: 10,
                height,
                backgroundColor: color,
                borderRadius: 3,
                transition: "background-color 0.15s",
                alignSelf: "flex-end",
              }}
            />
          );
        })}
      </div>
      <p className="text-white/75 text-sm mt-0.5">
        {tempo > 0
          ? `${Math.round(tempo)} BPM · ${Math.round(steadiness * 100)}% steady`
          : "Keep the beat!"}
      </p>
    </div>
  );
}

// ─── Design Notes Panel ──────────────────────────────────────────────────────

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full
                      max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-white mb-4">Design Notes</h2>
        <div className="space-y-4 text-white/80 text-base leading-relaxed">
          <p><span className="text-violet-300 font-semibold">Question:</span> What if a little creature only walked smoothly when you kept a steady beat?</p>
          <p><span className="text-violet-300 font-semibold">How to Play:</span> Tap &ldquo;Start&rdquo;, then clap or say &ldquo;bup bup bup&rdquo; in a steady rhythm. The creature walks smoother the more even your beat is. Keep steady for 8 steps to earn a flower reward!</p>
          <p><span className="text-violet-300 font-semibold">Technique:</span> A Web Audio AnalyserNode reads mic input each animation frame. Spectral flux (sum of positive bin-to-bin magnitude increases, weighted toward high frequencies) detects each clap onset. Inter-onset intervals (IOIs) are stored in a ring buffer. Steadiness = 1 − CV where CV = stddev/mean of recent IOIs. Tempo = 60000 / median(IOI) in BPM.</p>
          <p><span className="text-violet-300 font-semibold">Reference:</span> Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. <em>Psychonomic Bulletin &amp; Review, 12</em>(6), 969–992. The refractory window (~120 ms) follows tapping-study norms from this work.</p>
          <p><span className="text-violet-300 font-semibold">Sound:</span> Slendro pentatonic (Indonesian gamelan) — approx. [196, 226, 258, 296, 342] Hz and upper octave. Each step cycles through this non-Western 5-tone scale.</p>
          <p><span className="text-violet-300 font-semibold">Subsystems:</span> onset.ts (spectral flux detector), steadiness.ts (IOI ring buffer + CV), audio.ts (slendro synth), page.tsx (SVG creature + path scene + reward logic).</p>
          <p className="text-white/60 text-sm">Tags: INPUT=mic onsets · OUTPUT=SVG · TECHNIQUE=onset detection + IOI regularity · PALETTE=walking creature, slendro scale</p>
        </div>
        <button onClick={onClose}
          className="mt-6 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500
                     text-white font-semibold text-base transition-colors w-full">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KidsSteadyWalk() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [showNotes, setShowNotes] = useState(false);

  // Creature visual state (updated via rAF, stored in ref for perf, mirrored to state for render)
  const creatureRef = useRef<CreatureState>({
    x: 0,
    bodyBob: 0,
    leftLegAngle: 0,
    rightLegAngle: 0,
    wobble: 0,
    isHopping: false,
    hopFrame: 0,
    stepCount: 0,
    steadiness: 0,
    tempo: 0,
  });
  const [creature, setCreature] = useState<CreatureState>(creatureRef.current);
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const [footprints, setFootprints] = useState<FootprintMark[]>([]);

  // Audio / onset refs
  const audioRef = useRef<ReturnType<typeof createSteadyAudio> | null>(null);
  const onsetRef = useRef<ReturnType<typeof createOnsetDetector> | null>(null);
  const trackerRef = useRef<ReturnType<typeof createSteadinessTracker> | null>(null);
  const rafRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Demo refs
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoOnsetCountRef = useRef(0);
  const demoScriptIdxRef = useRef(0);

  // Reward
  const steadyStreakRef = useRef(0);
  const flowerIdRef = useRef(0);
  const footprintIdRef = useRef(0);

  // Leg animation
  const legPhaseRef = useRef(0); // 0..2π cycling

  // Path scroll offset (so creature stays at CREATURE_VIEW_X while world scrolls)
  const pathOffsetRef = useRef(0); // 0..1 how far we've walked

  // ─── Tear-down ─────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    audioRef.current?.dispose();
    audioRef.current = null;
    onsetRef.current?.dispose();
    onsetRef.current = null;
    trackerRef.current = null;
    demoOnsetCountRef.current = 0;
    demoScriptIdxRef.current = 0;
  }, []);

  useEffect(() => {
    return () => { stopAll(); };
  }, [stopAll]);

  // ─── Onset handler (shared by mic and demo) ────────────────────────────────

  const handleOnset = useCallback(() => {
    const tracker = trackerRef.current;
    const audio = audioRef.current;
    if (!tracker || !audio) return;

    tracker.addOnset(performance.now());
    const { steadiness, tempo } = tracker.getState();

    const c = creatureRef.current;
    const stepIdx = c.stepCount;
    audio.playFootstep(stepIdx);

    // Reward streak
    if (steadiness > 0.75) {
      steadyStreakRef.current += 1;
    } else {
      steadyStreakRef.current = Math.max(0, steadyStreakRef.current - 1);
    }

    if (steadyStreakRef.current >= STEPS_FOR_REWARD) {
      steadyStreakRef.current = 0;
      audio.playHop();
      audio.playFlower();
      const newFlower: Flower = {
        id: flowerIdRef.current++,
        x: pathOffsetRef.current + 0.55,
        bloom: 0,
      };
      setFlowers((prev) => [...prev.slice(-6), newFlower]);
      creatureRef.current = { ...creatureRef.current, isHopping: true, hopFrame: 0 };
    }

    // Add footprint
    const side: "left" | "right" = stepIdx % 2 === 0 ? "left" : "right";
    const fp: FootprintMark = {
      id: footprintIdRef.current++,
      x: pathOffsetRef.current,
      side,
      opacity: 1,
    };
    setFootprints((prev) => [...prev.slice(-20), fp]);

    // Advance creature
    const ioi = tracker.getState().iois.slice(-1)[0] ?? 500;
    const speed = clamp(500 / ioi, 0.3, 1.5) * 0.008;
    pathOffsetRef.current += speed;

    creatureRef.current = {
      ...creatureRef.current,
      stepCount: stepIdx + 1,
      steadiness,
      tempo,
    };
  }, []);

  // ─── Animation loop ────────────────────────────────────────────────────────

  const runLoop = useCallback(() => {
    const nowMs = performance.now();
    const onset = onsetRef.current?.sampleMic(nowMs);
    if (onset) handleOnset();

    // Animate legs
    const c = creatureRef.current;
    const { steadiness } = c;

    // Leg swing frequency tied to (smoothed) tempo
    const tempoHz = c.tempo > 0 ? c.tempo / 60 : 2.0;
    const legSpeed = clamp(tempoHz * 0.06, 0.02, 0.12);

    // Wobble decays over time
    const targetWobble = steadiness < 0.4 ? (Math.random() - 0.5) * 14 : 0;
    const wobble = lerp(c.wobble, targetWobble, 0.08);

    // Bob
    legPhaseRef.current = (legPhaseRef.current + legSpeed * Math.PI * 2) % (Math.PI * 2);
    const ph = legPhaseRef.current;
    const swingAmp = lerp(22, 12, steadiness); // unsteady = big lurching angles
    const leftLegAngle = Math.sin(ph) * swingAmp * (steadiness < 0.35
      ? (0.5 + Math.random()) : 1);
    const rightLegAngle = -Math.sin(ph) * swingAmp * (steadiness < 0.35
      ? (0.5 + Math.random()) : 1);
    const bodyBob = Math.abs(Math.sin(ph)) * lerp(5, 2, steadiness);

    // Hop animation
    let { isHopping, hopFrame } = c;
    if (isHopping) {
      hopFrame += 0.04;
      if (hopFrame >= 1) { isHopping = false; hopFrame = 0; }
    }

    creatureRef.current = {
      ...c, wobble, leftLegAngle, rightLegAngle, bodyBob, isHopping, hopFrame,
    };
    setCreature({ ...creatureRef.current });

    // Bloom flowers over time
    setFlowers((prev) =>
      prev.map((f) => ({ ...f, bloom: Math.min(1, f.bloom + 0.02) }))
    );

    // Fade footprints
    setFootprints((prev) =>
      prev
        .map((fp) => ({ ...fp, opacity: fp.opacity - 0.003 }))
        .filter((fp) => fp.opacity > 0)
    );

    rafRef.current = requestAnimationFrame(runLoop);
  }, [handleOnset]);

  // ─── Start (real mic) ─────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const actx = new AudioContext();
      audioCtxRef.current = actx;
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      source.connect(analyser);

      const detector = createOnsetDetector();
      detector.connect(analyser);
      onsetRef.current = detector;

      trackerRef.current = createSteadinessTracker();
      audioRef.current = createSteadyAudio();

      setAppState("running");
      rafRef.current = requestAnimationFrame(runLoop);
    } catch {
      setAppState("denied");
    }
  }, [runLoop]);

  // ─── Demo mode ────────────────────────────────────────────────────────────

  const scheduleDemoStep = useCallback(() => {
    const script = DEMO_SCRIPT;
    const idx = demoScriptIdxRef.current;
    if (idx >= script.length) {
      // loop
      demoScriptIdxRef.current = 0;
      scheduleDemoStep();
      return;
    }
    const { ioi, count } = script[idx];
    const stepsDone = demoOnsetCountRef.current;

    if (stepsDone >= count) {
      demoOnsetCountRef.current = 0;
      demoScriptIdxRef.current = idx + 1;
      scheduleDemoStep();
      return;
    }

    // Inject an onset with slight jitter
    const jitter = idx > 0 && script[idx - 1]?.ioi !== ioi
      ? (Math.random() - 0.5) * ioi * 0.25
      : (Math.random() - 0.5) * ioi * 0.04;
    const actualIoi = Math.max(200, ioi + jitter);

    const tracker = trackerRef.current;
    if (tracker) {
      tracker.addOnset(performance.now());
      const { steadiness, tempo } = tracker.getState();
      const audio = audioRef.current;
      if (audio) audio.playFootstep(creatureRef.current.stepCount);

      if (steadiness > 0.75) {
        steadyStreakRef.current += 1;
      } else {
        steadyStreakRef.current = Math.max(0, steadyStreakRef.current - 1);
      }
      if (steadyStreakRef.current >= STEPS_FOR_REWARD) {
        steadyStreakRef.current = 0;
        audio?.playHop();
        audio?.playFlower();
        const newFlower: Flower = {
          id: flowerIdRef.current++,
          x: pathOffsetRef.current + 0.55,
          bloom: 0,
        };
        setFlowers((prev) => [...prev.slice(-6), newFlower]);
        creatureRef.current = { ...creatureRef.current, isHopping: true, hopFrame: 0 };
      }

      const fp: FootprintMark = {
        id: footprintIdRef.current++,
        x: pathOffsetRef.current,
        side: creatureRef.current.stepCount % 2 === 0 ? "left" : "right",
        opacity: 1,
      };
      setFootprints((prev) => [...prev.slice(-20), fp]);

      const iois = tracker.getState().iois;
      const lastIoi = iois.slice(-1)[0] ?? 500;
      const speed = clamp(500 / lastIoi, 0.3, 1.5) * 0.008;
      pathOffsetRef.current += speed;

      creatureRef.current = {
        ...creatureRef.current,
        stepCount: creatureRef.current.stepCount + 1,
        steadiness,
        tempo,
      };
    }

    demoOnsetCountRef.current = stepsDone + 1;
    demoTimerRef.current = setTimeout(scheduleDemoStep, actualIoi);
  }, []);

  const startDemo = useCallback(() => {
    trackerRef.current = createSteadinessTracker();
    audioRef.current = createSteadyAudio();
    onsetRef.current = null; // no mic

    setAppState("demo");
    rafRef.current = requestAnimationFrame(runLoop);
    // Start demo onset stream after a short delay
    demoTimerRef.current = setTimeout(scheduleDemoStep, 600);
  }, [runLoop, scheduleDemoStep]);

  // ─── Render helpers ───────────────────────────────────────────────────────

  // SVG viewport is 400 wide, 220 tall (viewBox)
  const SVG_W = 400;
  const SVG_H = 220;
  const pathY = (PATH_Y / 100) * SVG_H; // ~150
  const creatureX = (CREATURE_VIEW_X / 100) * SVG_W; // ~120
  const creatureY = pathY - 42; // creature center above path

  // World offset: map pathOffset to pixel scroll
  const worldShift = (pathOffsetRef.current % 1) * SVG_W;

  // Flower world positions → SVG screen x
  const flowerScreenX = (flower: Flower) => {
    const relPos = flower.x - pathOffsetRef.current;
    return creatureX + relPos * SVG_W * 0.9;
  };

  // Footprint screen X
  const fpScreenX = (fp: FootprintMark) => {
    const relPos = fp.x - pathOffsetRef.current;
    return creatureX + relPos * SVG_W * 0.9;
  };

  const { steadiness, tempo } = creature;

  // Path color: glows green when steady
  const pathGlow = steadiness > 0.7
    ? `rgba(52,211,153,${0.3 + steadiness * 0.4})`
    : `rgba(100,116,139,0.5)`;

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-between
                    bg-slate-950 text-white select-none overflow-hidden"
      style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div className="w-full flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-white">Steady Walk</h1>
        <button
          onClick={() => setShowNotes(true)}
          className="text-white/75 text-sm underline underline-offset-2
                     hover:text-violet-300 transition-colors">
          Read the design notes
        </button>
      </div>

      {/* Scene */}
      <div className="w-full flex-1 flex flex-col items-center justify-center px-2 gap-4">

        {/* SVG Scene */}
        <div className="w-full max-w-xl relative">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{ width: "100%", aspectRatio: `${SVG_W}/${SVG_H}`, overflow: "hidden" }}
          >
            {/* Sky gradient */}
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(30,41,59,0.0)" />
                <stop offset="10%" stopColor={pathGlow} />
                <stop offset="90%" stopColor={pathGlow} />
                <stop offset="100%" stopColor="rgba(30,41,59,0.0)" />
              </linearGradient>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#skyGrad)" />

            {/* Stars */}
            {[
              [30, 20], [80, 10], [150, 30], [220, 15], [290, 25],
              [340, 12], [370, 35], [60, 45], [180, 8], [310, 40],
            ].map(([sx, sy], i) => (
              <circle key={i} cx={sx} cy={sy} r={1 + (i % 2) * 0.5}
                fill="white" opacity={0.3 + (i % 3) * 0.2} />
            ))}

            {/* Ground */}
            <rect x={0} y={pathY + 8} width={SVG_W} height={SVG_H - pathY - 8}
              fill="#1e3a2e" />

            {/* Path track */}
            <rect x={0} y={pathY - 4} width={SVG_W} height={26}
              fill="url(#pathGrad)" rx={8} />
            {/* Path edge lines */}
            <line x1={0} y1={pathY - 4} x2={SVG_W} y2={pathY - 4}
              stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
            <line x1={0} y1={pathY + 22} x2={SVG_W} y2={pathY + 22}
              stroke="rgba(148,163,184,0.25)" strokeWidth={1} />

            {/* Scrolling path markers (dashes) */}
            {Array.from({ length: 10 }, (_, i) => {
              const mx = ((i * 40 - worldShift % 40) + SVG_W) % SVG_W;
              return (
                <rect key={i} x={mx - 12} y={pathY + 7} width={24} height={4}
                  fill="rgba(255,255,255,0.12)" rx={2} />
              );
            })}

            {/* Footprints on path */}
            {footprints.map((fp) => {
              const sx = fpScreenX(fp);
              if (sx < -20 || sx > SVG_W + 20) return null;
              const fy = fp.side === "left" ? pathY + 4 : pathY + 14;
              return (
                <ellipse key={fp.id} cx={sx} cy={fy} rx={5} ry={3}
                  fill="rgba(167,243,208,0.6)" opacity={fp.opacity}
                  transform={`rotate(${fp.side === "left" ? -15 : 15}, ${sx}, ${fy})`}
                />
              );
            })}

            {/* Flowers ahead on path */}
            {flowers.map((f) => {
              const sx = flowerScreenX(f);
              if (sx < 0 || sx > SVG_W) return null;
              return (
                <FlowerSVG key={f.id} cx={sx} cy={pathY - 10} bloom={f.bloom} />
              );
            })}

            {/* Creature */}
            {(appState === "running" || appState === "demo") && (
              <CreatureSVG
                cx={creatureX}
                cy={creatureY}
                steadiness={creature.steadiness}
                leftLegAngle={creature.leftLegAngle}
                rightLegAngle={creature.rightLegAngle}
                wobble={creature.wobble}
                bodyBob={creature.bodyBob}
                isHopping={creature.isHopping}
                hopFrame={creature.hopFrame}
              />
            )}

            {/* Idle creature (static) */}
            {appState === "idle" && (
              <CreatureSVG
                cx={creatureX}
                cy={creatureY}
                steadiness={0.5}
                leftLegAngle={0}
                rightLegAngle={0}
                wobble={0}
                bodyBob={0}
                isHopping={false}
                hopFrame={0}
              />
            )}

            {/* Denied: static creature looking sad */}
            {appState === "denied" && (
              <CreatureSVG
                cx={creatureX}
                cy={creatureY}
                steadiness={0}
                leftLegAngle={12}
                rightLegAngle={-12}
                wobble={8}
                bodyBob={0}
                isHopping={false}
                hopFrame={0}
              />
            )}
          </svg>
        </div>

        {/* Steadiness meter */}
        {(appState === "running" || appState === "demo") && (
          <SteadinessMeter steadiness={steadiness} tempo={tempo} />
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-3 pb-6 px-4 w-full max-w-sm">

          {appState === "idle" && (
            <>
              <p className="text-white/80 text-base text-center">
                Clap or say &ldquo;bup bup bup&rdquo; in a steady beat!
              </p>
              <button
                onClick={startMic}
                className="w-full min-h-[64px] rounded-2xl bg-violet-600
                           hover:bg-violet-500 active:bg-violet-700
                           text-white text-xl font-bold transition-colors
                           shadow-lg shadow-violet-900/50">
                🎙 Start (use mic)
              </button>
              <button
                onClick={startDemo}
                className="w-full min-h-[64px] rounded-2xl bg-slate-700
                           hover:bg-slate-600 active:bg-slate-800
                           text-white text-base font-semibold transition-colors">
                Watch it play (demo)
              </button>
            </>
          )}

          {appState === "denied" && (
            <>
              <p className="text-rose-300 text-base text-center font-semibold">
                Mic not available — that is okay!
              </p>
              <button
                onClick={startDemo}
                className="w-full min-h-[64px] rounded-2xl bg-slate-700
                           hover:bg-slate-600 active:bg-slate-800
                           text-white text-xl font-bold transition-colors">
                Watch it play (demo)
              </button>
            </>
          )}

          {(appState === "running" || appState === "demo") && (
            <>
              <p className="text-white/75 text-base text-center">
                {appState === "demo"
                  ? "Demo mode — watch the creature!"
                  : "Clap or say \"bup bup bup\" in a steady beat!"}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    stopAll();
                    creatureRef.current = {
                      x: 0, bodyBob: 0, leftLegAngle: 0, rightLegAngle: 0,
                      wobble: 0, isHopping: false, hopFrame: 0,
                      stepCount: 0, steadiness: 0, tempo: 0,
                    };
                    setCreature(creatureRef.current);
                    setFlowers([]);
                    setFootprints([]);
                    pathOffsetRef.current = 0;
                    legPhaseRef.current = 0;
                    steadyStreakRef.current = 0;
                    setAppState("idle");
                  }}
                  className="flex-1 min-h-[64px] rounded-2xl bg-slate-700
                             hover:bg-slate-600 text-white text-base
                             font-semibold transition-colors">
                  Stop
                </button>
                {appState === "demo" && (
                  <button
                    onClick={() => {
                      stopAll();
                      creatureRef.current = {
                        x: 0, bodyBob: 0, leftLegAngle: 0, rightLegAngle: 0,
                        wobble: 0, isHopping: false, hopFrame: 0,
                        stepCount: 0, steadiness: 0, tempo: 0,
                      };
                      setCreature(creatureRef.current);
                      setFlowers([]);
                      setFootprints([]);
                      pathOffsetRef.current = 0;
                      legPhaseRef.current = 0;
                      steadyStreakRef.current = 0;
                      startMic();
                    }}
                    className="flex-1 min-h-[64px] rounded-2xl bg-violet-600
                               hover:bg-violet-500 text-white text-base
                               font-semibold transition-colors">
                    Use mic
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Design Notes Panel */}
      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </div>
  );
}
