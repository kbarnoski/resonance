"use client";

/**
 * 350-kids-bump-along — Newton's-cradle impulse propagation music machine.
 * A row of sleepy creatures passes a "bump" down the line; each wakes and
 * sings its pentatonic note as the wave reaches it. Tap any creature to
 * trigger an outward wave; drag to reorder the melody.
 *
 * Rendering: SVG inline JSX only (no Canvas2D, no WebGL).
 * Audio: Web Audio API, fully synthesised, routed through DynamicsCompressor + LPF.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildRig,
  startAmbientDrone,
  playCreatureNote,
  teardownRig,
  type AudioRig,
} from "./audio";

// ─── creature config ──────────────────────────────────────────────────────────

const NUM_CREATURES = 7;

/** Pentatonic pitch index (0 = C3 lowest/left, 6 = G4 highest/right). */
type CreatureDef = {
  color: string;     // fill
  glow: string;      // shadow / glow ring
  name: string;      // emoji hint (visual only, not shown as text)
  eyeHue: string;    // pupil color
};

const CREATURE_DEFS: CreatureDef[] = [
  { color: "#8b5cf6", glow: "#c4b5fd", name: "violet",  eyeHue: "#f5f3ff" },
  { color: "#3b82f6", glow: "#93c5fd", name: "blue",    eyeHue: "#eff6ff" },
  { color: "#06b6d4", glow: "#67e8f9", name: "cyan",    eyeHue: "#ecfeff" },
  { color: "#10b981", glow: "#6ee7b7", name: "emerald", eyeHue: "#ecfdf5" },
  { color: "#f59e0b", glow: "#fcd34d", name: "amber",   eyeHue: "#fffbeb" },
  { color: "#f97316", glow: "#fdba74", name: "orange",  eyeHue: "#fff7ed" },
  { color: "#ec4899", glow: "#f9a8d4", name: "pink",    eyeHue: "#fdf2f8" },
];

// ─── types ────────────────────────────────────────────────────────────────────

interface Creature {
  id: number;          // stable identity
  pitchIdx: number;    // index into PENTA_HZ in audio.ts (0–6 for 7 creatures)
  defIdx: number;      // index into CREATURE_DEFS (color/visual)
  // animation state (in refs, not React state)
}

interface AnimState {
  // per creature
  bounce:       number[];   // 0..1, drives squash-stretch
  glow:         number[];   // 0..1, glow ring intensity
  awake:        number[];   // 0..1, eye-open amount
  breathPhase:  number[];   // 0..2π, breathing cycle
  // drag state
  dragging:     number | null;   // creature index being dragged
  dragX:        number;
  // impulse wave
  waves:        Wave[];
  lastAutoDemo: number;   // ms timestamp
  audioUnlocked: boolean;
}

interface Wave {
  id:        number;
  origin:    number;   // creature index where impulse was born
  dir:       1 | -1;  // direction: +1 = right, -1 = left
  pos:       number;   // current float position (creature index)
  speed:     number;   // creatures per second
  bouncing:  boolean;  // currently in reflective bounce (for visual)
  fired:     Set<number>; // creatures that have already been triggered by this wave
}

// ─── constants ────────────────────────────────────────────────────────────────

const WAVE_SPEED = 2.6;           // creatures / second
const BOUNCE_DECAY = 0.88;        // speed multiplier on reflection
const GLOW_DECAY = 0.92;          // per-frame (60fps assumed)
const AWAKE_DECAY = 0.97;
const BREATH_SPEED = 0.8;         // radians per second
const AUTO_DEMO_INTERVAL = 5500;  // ms between auto-demo cycles
let _waveId = 0;

// ─── helpers (no "use" prefix) ────────────────────────────────────────────────

function makeInitialAnim(n: number): AnimState {
  return {
    bounce:      Array(n).fill(0),
    glow:        Array(n).fill(0),
    awake:       Array(n).fill(0),
    breathPhase: Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2),
    dragging:    null,
    dragX:       0,
    waves:       [],
    lastAutoDemo: 0,
    audioUnlocked: false,
  };
}

function makeInitialOrder(n: number): Creature[] {
  return Array.from({ length: n }, (_, i) => ({
    id:       i,
    pitchIdx: i,
    defIdx:   i % CREATURE_DEFS.length,
  }));
}

/** Spawn a wave from a creature index in one direction. */
function spawnWave(anim: AnimState, origin: number, dir: 1 | -1): void {
  const w: Wave = {
    id:      _waveId++,
    origin,
    dir,
    pos:     origin + (dir === 1 ? 0.01 : -0.01),
    speed:   WAVE_SPEED,
    bouncing: false,
    fired:   new Set([origin]),
  };
  anim.waves.push(w);
}

/** Trigger creature visuals for a "hit". */
function triggerCreatureAnim(anim: AnimState, idx: number, intensity = 1.0): void {
  anim.bounce[idx] = Math.min(1, anim.bounce[idx] + intensity);
  anim.glow[idx]   = Math.min(1, anim.glow[idx] + intensity);
  anim.awake[idx]  = Math.min(1, anim.awake[idx] + intensity);
}

// ─── SVG creature renderer ────────────────────────────────────────────────────

interface CreatureSvgProps {
  def:        CreatureDef;
  cx:         number;
  cy:         number;
  r:          number;
  bounce:     number;
  glow:       number;
  awake:      number;
  breathAmt:  number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

function CreatureSvg({
  def, cx, cy, r, bounce, glow, awake, breathAmt, isDragging, onPointerDown,
}: CreatureSvgProps) {
  // Squash-stretch: when bouncing, squash horizontally / stretch vertically
  const squashX = 1 + bounce * 0.35 - breathAmt * 0.04;
  const squashY = 1 - bounce * 0.22 + breathAmt * 0.06;
  // Slight bob up when bouncing
  const bobY = -bounce * r * 0.25;

  const glowRadius = r + glow * r * 0.55;
  const glowOpacity = glow * 0.55;

  // Eyes: when awake, fully open circles; when asleep, small arcs
  const eyeOpenAmt = awake;   // 0 = sleepy, 1 = wide awake
  const eyeYOffset = -r * 0.15;
  const eyeXOff    = r * 0.28;
  const eyeR       = r * 0.13;
  const pupilR     = eyeR * 0.55;

  // Smile: open when awake, neutral line when asleep
  const smileAmt = awake * 0.8 + 0.2;  // always at least a gentle smile

  const transform = `translate(${cx}, ${cy + bobY}) scale(${squashX}, ${squashY})`;

  return (
    <g
      transform={transform}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
    >
      {/* Glow ring */}
      {glow > 0.02 && (
        <circle
          r={glowRadius / squashX}
          fill="none"
          stroke={def.glow}
          strokeWidth={r * 0.18}
          opacity={glowOpacity}
        />
      )}

      {/* Body */}
      <circle r={r} fill={def.color} />

      {/* Cheek blush */}
      <ellipse
        cx={-r * 0.38}
        cy={r * 0.22}
        rx={r * 0.22}
        ry={r * 0.13}
        fill={def.glow}
        opacity={0.35}
      />
      <ellipse
        cx={r * 0.38}
        cy={r * 0.22}
        rx={r * 0.22}
        ry={r * 0.13}
        fill={def.glow}
        opacity={0.35}
      />

      {/* Left eye */}
      <g transform={`translate(${-eyeXOff}, ${eyeYOffset})`}>
        <circle r={eyeR} fill="white" opacity={0.92} />
        <circle
          r={pupilR}
          cy={eyeR * (1 - eyeOpenAmt) * 0.3}
          fill="#1a0030"
          opacity={0.88}
        />
        {/* sleepy lid */}
        {eyeOpenAmt < 0.85 && (
          <rect
            x={-eyeR}
            y={-eyeR}
            width={eyeR * 2}
            height={eyeR * (1 - eyeOpenAmt) + 1}
            fill={def.color}
            rx={eyeR * 0.4}
          />
        )}
      </g>

      {/* Right eye */}
      <g transform={`translate(${eyeXOff}, ${eyeYOffset})`}>
        <circle r={eyeR} fill="white" opacity={0.92} />
        <circle
          r={pupilR}
          cy={eyeR * (1 - eyeOpenAmt) * 0.3}
          fill="#1a0030"
          opacity={0.88}
        />
        {eyeOpenAmt < 0.85 && (
          <rect
            x={-eyeR}
            y={-eyeR}
            width={eyeR * 2}
            height={eyeR * (1 - eyeOpenAmt) + 1}
            fill={def.color}
            rx={eyeR * 0.4}
          />
        )}
      </g>

      {/* Mouth — arc smile */}
      <path
        d={`M ${-r * 0.28 * smileAmt} ${r * 0.32}
            Q 0 ${r * (0.32 + 0.22 * smileAmt)}
            ${r * 0.28 * smileAmt} ${r * 0.32}`}
        fill="none"
        stroke={def.eyeHue}
        strokeWidth={r * 0.085}
        strokeLinecap="round"
        opacity={0.82}
      />

      {/* Music note sparkle when awake (very simple ♪ as tiny circle + stem) */}
      {awake > 0.5 && (
        <g opacity={awake * 0.7} transform={`translate(${r * 0.62}, ${-r * 0.52})`}>
          <circle r={r * 0.085} fill={def.glow} />
          <line
            x1={r * 0.085}
            y1={0}
            x2={r * 0.085}
            y2={-r * 0.28}
            stroke={def.glow}
            strokeWidth={r * 0.065}
          />
        </g>
      )}
    </g>
  );
}

// ─── impulse wave visual (a traveling "shockwave ring") ───────────────────────

interface WaveRingProps {
  wave: Wave;
  positions: number[];   // x positions of creatures
  cy:        number;
  r:         number;
}

function WaveRingEl({ wave, positions, cy, r }: WaveRingProps) {
  // Interpolate visual x from wave.pos
  const clampedPos = Math.max(0, Math.min(positions.length - 1, wave.pos));
  const lo = Math.floor(clampedPos);
  const hi = Math.min(positions.length - 1, lo + 1);
  const t  = clampedPos - lo;
  const wx = positions[lo] + (positions[hi] - positions[lo]) * t;

  const intensity = 0.7;
  return (
    <circle
      cx={wx}
      cy={cy}
      r={r * 0.45}
      fill="none"
      stroke="white"
      strokeWidth={r * 0.08}
      opacity={intensity * 0.55}
    />
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function KidsBumpAlong() {
  // ── React state (for render) ──────────────────────────────────────────────
  const [creatures, setCreatures] = useState<Creature[]>(() =>
    makeInitialOrder(NUM_CREATURES)
  );
  const [showReadme, setShowReadme] = useState(false);

  // Visual state for SVG (updated via rAF, stored in ref + triggered by setState)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_visualTick, setVisualTick] = useState(0);  // increment to force re-render

  // ── mutable refs (no re-render) ───────────────────────────────────────────
  const rigRef     = useRef<AudioRig | null>(null);
  const animRef    = useRef<AnimState>(makeInitialAnim(NUM_CREATURES));
  const rafRef     = useRef<number>(0);
  const lastTsRef  = useRef<number>(0);
  const creaturesRef = useRef<Creature[]>(creatures);
  const svgRef     = useRef<SVGSVGElement>(null);

  // Drag tracking
  const dragStartIdxRef    = useRef<number | null>(null);
  const dragTargetIdxRef   = useRef<number | null>(null);
  const dragPointerIdRef   = useRef<number | null>(null);

  // Keep creaturesRef in sync
  useEffect(() => {
    creaturesRef.current = creatures;
  }, [creatures]);

  // ── layout helpers ────────────────────────────────────────────────────────

  const computePositions = useCallback((W: number, n: number) => {
    const margin = Math.max(48, W * 0.07);
    const spacing = (W - margin * 2) / (n - 1);
    return Array.from({ length: n }, (_, i) => margin + i * spacing);
  }, []);

  const getCreatureRadius = useCallback((W: number, n: number) => {
    const spacing = (W - Math.max(48, W * 0.07) * 2) / (n - 1);
    return Math.max(32, Math.min(56, spacing * 0.42));
  }, []);

  // ── audio unlock + setup ──────────────────────────────────────────────────

  const unlockAudio = useCallback(() => {
    if (rigRef.current) return;
    try {
      const rig = buildRig();
      rigRef.current = rig;
      rig.ctx.resume().then(() => {
        startAmbientDrone(rig);
        animRef.current.audioUnlocked = true;
      }).catch(() => {/* ignore */});
    } catch {
      // AudioContext unavailable — visuals still work
    }
  }, []);

  // ── trigger an impulse from a creature ───────────────────────────────────

  const triggerImpulse = useCallback((creatureIdx: number) => {
    const anim = animRef.current;
    const n = creaturesRef.current.length;

    // Trigger the tapped creature immediately
    triggerCreatureAnim(anim, creatureIdx, 1.0);
    if (rigRef.current && anim.audioUnlocked) {
      const pitchIdx = creaturesRef.current[creatureIdx].pitchIdx;
      playCreatureNote(rigRef.current, pitchIdx, 1.0);
    }

    // Spawn wave(s): outward in both directions if in the middle
    if (creatureIdx > 0) {
      spawnWave(anim, creatureIdx, -1);
    }
    if (creatureIdx < n - 1) {
      spawnWave(anim, creatureIdx, 1);
    }
  }, []);

  // ── rAF loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const anim = animRef.current;
    const n = NUM_CREATURES;

    const step = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      // Breathing
      for (let i = 0; i < n; i++) {
        anim.breathPhase[i] = (anim.breathPhase[i] + BREATH_SPEED * dt) % (Math.PI * 2);
      }

      // Decay bounce + glow + awake
      for (let i = 0; i < n; i++) {
        anim.bounce[i] *= Math.pow(GLOW_DECAY, dt * 60);
        anim.glow[i]   *= Math.pow(GLOW_DECAY, dt * 60);
        anim.awake[i]  *= Math.pow(AWAKE_DECAY, dt * 60);
        if (anim.bounce[i] < 0.001) anim.bounce[i] = 0;
        if (anim.glow[i]   < 0.001) anim.glow[i]   = 0;
        if (anim.awake[i]  < 0.001) anim.awake[i]  = 0;
      }

      // Step waves
      const deadWaves: number[] = [];
      anim.waves.forEach((wave, wi) => {
        wave.pos += wave.dir * wave.speed * dt;

        const current = creaturesRef.current;

        // Check each creature to see if wave has passed through it
        for (let i = 0; i < n; i++) {
          if (wave.fired.has(i)) continue;
          // Has wave crossed creature i?
          const crossed =
            (wave.dir === 1 && wave.pos >= i) ||
            (wave.dir === -1 && wave.pos <= i);
          if (crossed) {
            wave.fired.add(i);
            triggerCreatureAnim(anim, i, 0.85);
            if (rigRef.current && anim.audioUnlocked) {
              playCreatureNote(rigRef.current, current[i].pitchIdx, 0.85);
            }
          }
        }

        // Reflect at ends
        if (wave.dir === 1 && wave.pos >= n - 1) {
          wave.pos = n - 1 - 0.01;
          wave.dir = -1;
          wave.speed *= BOUNCE_DECAY;
          wave.bouncing = true;
          // Only continue if there's still meaningful energy
          if (wave.speed < WAVE_SPEED * 0.18) {
            deadWaves.push(wi);
          }
        } else if (wave.dir === -1 && wave.pos <= 0) {
          wave.pos = 0.01;
          wave.dir = 1;
          wave.speed *= BOUNCE_DECAY;
          wave.bouncing = true;
          if (wave.speed < WAVE_SPEED * 0.18) {
            deadWaves.push(wi);
          }
        }
      });

      // Remove dead waves (in reverse index order)
      for (let i = deadWaves.length - 1; i >= 0; i--) {
        anim.waves.splice(deadWaves[i], 1);
      }

      // Auto-demo: spawn a wave from the left every AUTO_DEMO_INTERVAL ms
      if (
        ts - anim.lastAutoDemo > AUTO_DEMO_INTERVAL &&
        anim.waves.length === 0
      ) {
        anim.lastAutoDemo = ts;
        // Start demo at left (creature 0) and just fire right
        triggerCreatureAnim(anim, 0, 0.8);
        spawnWave(anim, 0, 1);
        // Audio only if unlocked
        if (rigRef.current && anim.audioUnlocked) {
          playCreatureNote(rigRef.current, creaturesRef.current[0].pitchIdx, 0.8);
        }
      }

      setVisualTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── teardown audio on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rigRef.current) {
        teardownRig(rigRef.current);
        rigRef.current = null;
      }
    };
  }, []);

  // ── pointer handlers (tap + drag) ─────────────────────────────────────────

  const handleCreaturePointerDown = useCallback(
    (creatureIdx: number, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();

      dragStartIdxRef.current = creatureIdx;
      dragTargetIdxRef.current = creatureIdx;
      dragPointerIdRef.current = e.pointerId;
      animRef.current.dragging = creatureIdx;
      animRef.current.dragX = e.clientX;

      triggerImpulse(creatureIdx);

      // Set pointer capture on the SVG
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [unlockAudio, triggerImpulse]
  );

  // We need to track pointer move/up on the SVG level
  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const anim = animRef.current;
      if (anim.dragging === null) return;
      if (e.pointerId !== dragPointerIdRef.current) return;

      anim.dragX = e.clientX;

      // Compute which slot the drag is over
      const svg = svgRef.current;
      if (!svg) return;
      const W = svg.clientWidth;
      const n = creaturesRef.current.length;
      const positions = computePositions(W, n);

      // Find closest creature position
      let closest = 0;
      let bestDist = Infinity;
      positions.forEach((px, i) => {
        const d = Math.abs(px - e.clientX);
        if (d < bestDist) { bestDist = d; closest = i; }
      });

      if (closest !== dragTargetIdxRef.current) {
        dragTargetIdxRef.current = closest;
        // Swap creatures in state
        const from = dragStartIdxRef.current!;
        if (from !== closest) {
          setCreatures((prev) => {
            const next = [...prev];
            // Swap the creature at `from` with creature at `closest`
            [next[from], next[closest]] = [next[closest], next[from]];
            return next;
          });
          // Update drag start to new position (so next swap is relative)
          dragStartIdxRef.current = closest;
        }
      }
    },
    [computePositions]
  );

  const handleSvgPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerId !== dragPointerIdRef.current) return;
      animRef.current.dragging = null;
      dragStartIdxRef.current = null;
      dragTargetIdxRef.current = null;
      dragPointerIdRef.current = null;
    },
    []
  );

  // ── render ────────────────────────────────────────────────────────────────

  // We read layout from a container ref via SVG viewBox
  // We use a fixed 800-unit wide coordinate space and scale via SVG viewBox
  const SVG_W = 800;
  const SVG_H = 320;
  const CY = SVG_H * 0.52;

  const positions = computePositions(SVG_W, NUM_CREATURES);
  const R = getCreatureRadius(SVG_W, NUM_CREATURES);
  const anim = animRef.current;

  // Build visual tick-driven snapshot (safe to read refs here since we triggered re-render)
  const bounceSnap  = [...anim.bounce];
  const glowSnap    = [...anim.glow];
  const awakeSnap   = [...anim.awake];
  const breathSnap  = anim.breathPhase.map((p) => Math.sin(p) * 0.5 + 0.5);
  const wavesSnap   = [...anim.waves];

  return (
    <div
      className="relative w-full min-h-screen flex flex-col items-center justify-center select-none overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0f0720 0%, #0a1a2e 55%, #0d0f1a 100%)" }}
      onPointerDown={unlockAudio}
    >
      {/* Stars background */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        {Array.from({ length: 55 }, (_, i) => {
          const x = ((i * 137.5) % 100);
          const y = ((i * 97.3) % 100);
          const r = 0.5 + (i % 3) * 0.4;
          const op = 0.12 + (i % 5) * 0.09;
          return (
            <circle
              key={i}
              cx={`${x}%`}
              cy={`${y}%`}
              r={r}
              fill="white"
              opacity={op}
            />
          );
        })}
      </svg>

      {/* Title */}
      <h1 className="text-white/95 text-2xl font-bold tracking-wide mb-3 z-10 pointer-events-none">
        🐾 Bump Along
      </h1>
      <p className="text-white/55 text-sm mb-6 z-10 pointer-events-none">
        tap a creature · drag to reorder
      </p>

      {/* Main SVG play area */}
      <div className="relative w-full max-w-3xl z-10 px-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
          aria-label="Bump Along — tap creatures to send a musical wave"
          role="img"
        >
          {/* Ground / platform line */}
          <line
            x1={positions[0] - R * 1.1}
            y1={CY + R * 1.05}
            x2={positions[positions.length - 1] + R * 1.1}
            y2={CY + R * 1.05}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Connector string between creatures */}
          {positions.map((px, i) => {
            if (i === 0) return null;
            const prevPx = positions[i - 1];
            return (
              <line
                key={`conn-${i}`}
                x1={prevPx + R * 0.92}
                y1={CY}
                x2={px - R * 0.92}
                y2={CY}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={2.5}
                strokeDasharray="4 6"
              />
            );
          })}

          {/* Wave rings */}
          {wavesSnap.map((w) => (
            <WaveRingEl
              key={w.id}
              wave={w}
              positions={positions}
              cy={CY}
              r={R}
            />
          ))}

          {/* Creatures */}
          {creatures.map((creature, idx) => {
            const def = CREATURE_DEFS[creature.defIdx];
            const px  = positions[idx];
            return (
              <CreatureSvg
                key={creature.id}
                def={def}
                cx={px}
                cy={CY}
                r={R}
                bounce={bounceSnap[idx] ?? 0}
                glow={glowSnap[idx] ?? 0}
                awake={awakeSnap[idx] ?? 0}
                breathAmt={breathSnap[idx] ?? 0.5}
                isDragging={anim.dragging === idx}
                onPointerDown={(e) => handleCreaturePointerDown(idx, e)}
              />
            );
          })}

          {/* Pitch-size hint: small circles above each creature (low = large, high = small) */}
          {creatures.map((creature, idx) => {
            const px = positions[idx];
            const sizeHint = R * 0.22 * (1 - creature.pitchIdx / (NUM_CREATURES * 1.6));
            return (
              <circle
                key={`hint-${creature.id}`}
                cx={px}
                cy={CY - R * 1.55}
                r={Math.max(4, sizeHint)}
                fill={CREATURE_DEFS[creature.defIdx].glow}
                opacity={0.28}
              />
            );
          })}
        </svg>
      </div>

      {/* Pitch labels (note dots below) */}
      <div className="flex items-end justify-center gap-1 mt-1 w-full max-w-3xl px-2 z-10 pointer-events-none">
        {creatures.map((creature) => {
          const def = CREATURE_DEFS[creature.defIdx];
          const noteNames = ["C","E","G","A","C","E","G"];
          return (
            <div
              key={`lbl-${creature.id}`}
              className="flex-1 flex flex-col items-center gap-0.5"
            >
              <div
                className="text-white/55 text-xs font-mono"
                style={{ fontSize: "0.65rem" }}
              >
                {noteNames[creature.pitchIdx] ?? "C"}
              </div>
              <div
                className="rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: def.color,
                  opacity: 0.55,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom hint row */}
      <div className="mt-6 z-10 flex items-center gap-4">
        <p className="text-white/45 text-xs font-mono">
          ↔ drag to remix melody
        </p>
      </div>

      {/* README corner button */}
      <button
        onClick={() => setShowReadme((v) => !v)}
        className="absolute bottom-4 right-4 z-20 text-white/55 text-xs font-mono
                   bg-white/5 hover:bg-white/10 border border-white/10 rounded px-3 py-1.5
                   transition-colors"
        aria-label="Show README"
      >
        README
      </button>

      {/* README overlay */}
      {showReadme && (
        <div
          className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setShowReadme(false)}
        >
          <div
            className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-lg w-full
                       text-white/85 text-sm leading-relaxed overflow-y-auto max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white/95 text-xl font-bold mb-3">350 — Bump Along</h2>
            <p className="text-white/55 text-xs mb-4">tap backdrop to close</p>
            <div className="space-y-3 font-mono text-xs leading-relaxed">
              <p><strong className="text-white/90">For:</strong> kids (4+)</p>
              <p><strong className="text-white/90">Pitch:</strong> A row of sleepy creatures passes a bump down the line — each wakes and sings as the wave reaches it.</p>
              <p><strong className="text-white/90">Novel:</strong> First impulse-propagation / Newton&apos;s-cradle chain-reaction music machine in the lab.</p>
              <p><strong className="text-white/90">Impulse propagation:</strong> A wave object travels at WAVE_SPEED creatures/second; as it crosses each creature index it triggers squash-stretch + pentatonic note. At the end it reflects with BOUNCE_DECAY speed reduction, creating a return melody.</p>
              <p><strong className="text-white/90">Pitch mapping:</strong> 7 creatures → C3 E3 G3 A3 C4 E4 G4 (pentatonic, left = low/large BANDIMAL convention). Drag to reorder → melody changes.</p>
              <p><strong className="text-white/90">Synthesis:</strong> Additive sine stack (fundamental + octave + 3rd harmonic) with fast attack + exponential decay for marimba warmth. All audio routed DynamicsCompressor + 9kHz LPF.</p>
              <p><strong className="text-white/90">References:</strong> Newton&apos;s cradle impulse transfer; &quot;pass it down the line&quot; physical toy; Rube-Goldberg sequential trigger; BANDIMAL pitch-size convention.</p>
              <p><strong className="text-white/90">Graceful degradation:</strong> AudioContext errors caught silently; visuals + auto-demo run forever without sound.</p>
              <p><strong className="text-white/90">Next cycle:</strong> variable wave speed by creature mass; multi-wave interference chords; momentum trails; voice recording per creature.</p>
            </div>
            <button
              onClick={() => setShowReadme(false)}
              className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 rounded text-white/75 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Back link */}
      <Link
        href="/dream"
        className="absolute top-4 left-4 z-20 text-white/45 text-xs font-mono
                   hover:text-white/70 transition-colors"
      >
        ← dream lab
      </Link>
    </div>
  );
}
