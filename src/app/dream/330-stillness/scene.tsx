"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 330 · Stillness — INLINE SVG renderer
//   A dark one-point-perspective wireframe room with an additive light bloom at
//   center (radial-gradient core + halo under a Gaussian-blur glow filter), plus
//   ~46 slowly drifting motes whose brightness/spread track the bloom; on startle
//   they scatter outward then settle. No Canvas2D, no WebGL — SVG only.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from "react";

export interface Mote {
  // Base resting position in viewBox units.
  bx: number;
  by: number;
  // Current drift offset.
  dx: number;
  dy: number;
  // Scatter velocity (decays toward 0).
  vx: number;
  vy: number;
  r: number;
  // Per-mote drift phase + speed.
  phase: number;
  speed: number;
  // Random twinkle seed.
  tw: number;
}

const VW = 1000;
const VH = 620;
const CX = VW / 2;
const CY = VH * 0.46;

/** Initialise the mote field. Deterministic-ish spread around the bloom core. */
export function createMotes(count: number): Mote[] {
  const motes: Mote[] = [];
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 40 + Math.random() * 360;
    motes.push({
      bx: CX + Math.cos(ang) * rad * 1.3,
      by: CY + Math.sin(ang) * rad * 0.8,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      r: 1.1 + Math.random() * 2.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.5,
      tw: Math.random() * Math.PI * 2,
    });
  }
  return motes;
}

/** Advance the mote field one frame (mutates in place).
 *  bloom 0..1 controls drift amplitude; `scatter` is an impulse 0..1 applied
 *  outward from the core on a startle. */
export function runMotes(
  motes: Mote[],
  bloom: number,
  scatterImpulse: number,
  dt: number,
  tSec: number
) {
  for (const m of motes) {
    if (scatterImpulse > 0) {
      const ddx = m.bx + m.dx - CX;
      const ddy = m.by + m.dy - CY;
      const len = Math.hypot(ddx, ddy) || 1;
      const push = (60 + Math.random() * 120) * scatterImpulse;
      m.vx += (ddx / len) * push;
      m.vy += (ddy / len) * push;
    }
    // Apply scatter velocity, decaying.
    m.dx += m.vx * dt;
    m.dy += m.vy * dt;
    m.vx *= 0.9;
    m.vy *= 0.9;
    // Gentle pull back toward rest, stronger as things settle.
    m.dx += -m.dx * 0.6 * dt;
    m.dy += -m.dy * 0.6 * dt;
    // Slow ambient drift, amplitude grows with bloom.
    const amp = 6 + bloom * 26;
    m.dx += Math.cos(tSec * m.speed + m.phase) * amp * 0.012;
    m.dy += Math.sin(tSec * m.speed * 0.8 + m.phase) * amp * 0.012;
  }
}

interface SceneProps {
  motes: Mote[];
  bloom: number;
  // RMS 0..1 for the live meter, plus thresholds.
  rms: number;
  quiet: number;
  noise: number;
  startleFlash: number; // 0..1 fades after a startle
}

/** Pure render of the current frame. Parent passes a frame counter via key-less
 *  prop changes; we read mote positions directly. */
function SceneImpl({
  motes,
  bloom,
  rms,
  quiet,
  noise,
  startleFlash,
}: SceneProps) {
  const b = Math.max(0, Math.min(1, bloom));
  const coreR = 34 + b * 120;
  const haloR = 90 + b * 300;
  const coreOpacity = 0.18 + b * 0.7;

  // One-point-perspective room: four walls receding to the vanishing point.
  const vp = { x: CX, y: CY - 10 };
  const m = 30; // outer frame margin
  const corners = [
    { x: m, y: m },
    { x: VW - m, y: m },
    { x: VW - m, y: VH - m },
    { x: m, y: VH - m },
  ];
  // Inner (receded) rectangle toward the vanishing point.
  const recede = 0.62;
  const inner = corners.map((c) => ({
    x: c.x + (vp.x - c.x) * recede,
    y: c.y + (vp.y - c.y) * recede,
  }));

  const wallColor = `rgba(140,150,210,${0.1 + b * 0.16})`;
  const floorLines = 5;

  // Live meter geometry (bottom-left).
  const meterX = 46;
  const meterY = VH - 70;
  const meterW = 230;
  const meterH = 12;
  const quietX = meterX + meterW * quiet;
  const noiseX = meterX + meterW * noise;
  const rmsW = Math.max(0, Math.min(1, rms)) * meterW;
  const overNoise = rms >= noise;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="A dark wireframe room with a central light that blooms in silence and scatters at sound."
    >
      <defs>
        <radialGradient id="st-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fdf6e3" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#ffe7b8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="st-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#6d5cff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="st-vignette" cx="50%" cy="46%" r="75%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.75" />
        </radialGradient>
        <filter id="st-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={5 + b * 9} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="st-mote-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation={1 + b * 3} />
        </filter>
      </defs>

      {/* Background */}
      <rect x="0" y="0" width={VW} height={VH} fill="#05060f" />

      {/* ── One-point-perspective wireframe room ── */}
      <g stroke={wallColor} strokeWidth="1" fill="none">
        {/* receding edges */}
        {corners.map((c, i) => (
          <line key={`edge-${i}`} x1={c.x} y1={c.y} x2={inner[i].x} y2={inner[i].y} />
        ))}
        {/* outer & inner frames */}
        <polygon points={corners.map((c) => `${c.x},${c.y}`).join(" ")} />
        <polygon points={inner.map((c) => `${c.x},${c.y}`).join(" ")} />
        {/* floor grid lines from bottom edge toward vanishing point */}
        {Array.from({ length: floorLines }).map((_, i) => {
          const f = (i + 1) / (floorLines + 1);
          const x = m + (VW - 2 * m) * f;
          return (
            <line
              key={`fl-${i}`}
              x1={x}
              y1={VH - m}
              x2={vp.x + (x - vp.x) * (1 - recede)}
              y2={inner[3].y}
            />
          );
        })}
      </g>

      {/* ── Additive light bloom (the reward for stillness) ── */}
      <g filter="url(#st-glow)" style={{ mixBlendMode: "screen" }}>
        <circle cx={CX} cy={CY} r={haloR} fill="url(#st-halo)" opacity={0.2 + b * 0.7} />
        <circle cx={CX} cy={CY} r={coreR} fill="url(#st-core)" opacity={coreOpacity} />
      </g>

      {/* ── Motes ── */}
      <g filter="url(#st-mote-glow)" style={{ mixBlendMode: "screen" }}>
        {motes.map((mt, i) => {
          const x = mt.bx + mt.dx;
          const y = mt.by + mt.dy;
          const op = 0.12 + b * 0.7;
          const rr = mt.r * (0.7 + b * 0.9);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={rr}
              fill={i % 5 === 0 ? "#ffe7b8" : "#c4b5fd"}
              opacity={op}
            />
          );
        })}
      </g>

      {/* Startle flash — a quick cool wash that fades */}
      {startleFlash > 0.01 && (
        <rect
          x="0"
          y="0"
          width={VW}
          height={VH}
          fill="#dbe4ff"
          opacity={startleFlash * 0.22}
          style={{ mixBlendMode: "screen" }}
        />
      )}

      <rect x="0" y="0" width={VW} height={VH} fill="url(#st-vignette)" pointerEvents="none" />

      {/* ── Live input meter ── */}
      <g fontFamily="ui-monospace, monospace">
        <text x={meterX} y={meterY - 10} fill="rgba(255,255,255,0.7)" fontSize="15">
          room level
        </text>
        <rect
          x={meterX}
          y={meterY}
          width={meterW}
          height={meterH}
          rx={6}
          fill="rgba(255,255,255,0.08)"
        />
        <rect
          x={meterX}
          y={meterY}
          width={rmsW}
          height={meterH}
          rx={6}
          fill={overNoise ? "#fca5a5" : rms < quiet ? "#6ee7b7" : "#fcd34d"}
        />
        {/* QUIET threshold marker */}
        <line
          x1={quietX}
          y1={meterY - 5}
          x2={quietX}
          y2={meterY + meterH + 5}
          stroke="#6ee7b7"
          strokeWidth="2"
        />
        <text x={quietX} y={meterY + meterH + 20} fill="#6ee7b7" fontSize="12" textAnchor="middle">
          quiet
        </text>
        {/* NOISE threshold marker */}
        <line
          x1={noiseX}
          y1={meterY - 5}
          x2={noiseX}
          y2={meterY + meterH + 5}
          stroke="#fca5a5"
          strokeWidth="2"
        />
        <text x={noiseX} y={meterY + meterH + 20} fill="#fca5a5" fontSize="12" textAnchor="middle">
          startle
        </text>
      </g>
    </svg>
  );
}

export const Scene = memo(SceneImpl);
