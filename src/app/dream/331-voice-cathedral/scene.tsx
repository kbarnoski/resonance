// ─────────────────────────────────────────────────────────────────────────────
// scene.tsx — a minimal, legible top-down radar rendered as inline SVG.
//
// Explicitly NOT Canvas2D, NOT WebGL, NOT three.js — just <svg>.
// A dim breathing listener dot at center; each active voice is a glowing dot
// orbiting at its azimuth (colored by scale degree) with a faint tether line.
// Low information density, calm, reverent.
// ─────────────────────────────────────────────────────────────────────────────

import { DEGREE_COLORS, type VoiceSnapshot } from "./audio";

const SIZE = 320;
const CENTER = SIZE / 2;
const MAX_R = 130; // pixel radius of the outer ring (where voices live).

export interface SceneProps {
  voices: VoiceSnapshot[];
  breath: number; // 0..1 slow breathing phase for the listener dot.
  singing: boolean; // whether a pitch is currently detected.
}

export default function Scene({ voices, breath, singing }: SceneProps) {
  const breathR = 7 + breath * 3.5;
  const ringPx = MAX_R; // all voices sit on the outer ring.

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Top-down radar of your spatial choir"
      className="block max-w-[360px] mx-auto"
    >
      {/* faint concentric guide rings */}
      {[0.45, 0.72, 1].map((f, i) => (
        <circle
          key={i}
          cx={CENTER}
          cy={CENTER}
          r={MAX_R * f}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.06}
          strokeWidth={1}
        />
      ))}

      {/* tether lines */}
      {voices.map((v) => {
        const px = CENTER + Math.sin(v.azimuth) * ringPx;
        const py = CENTER - Math.cos(v.azimuth) * ringPx;
        return (
          <line
            key={`t-${v.id}`}
            x1={CENTER}
            y1={CENTER}
            x2={px}
            y2={py}
            stroke={DEGREE_COLORS[v.ratioIndex] ?? "#ffffff"}
            strokeOpacity={0.18}
            strokeWidth={1}
          />
        );
      })}

      {/* voice dots */}
      {voices.map((v) => {
        const px = CENTER + Math.sin(v.azimuth) * ringPx;
        const py = CENTER - Math.cos(v.azimuth) * ringPx;
        const color = DEGREE_COLORS[v.ratioIndex] ?? "#ffffff";
        return (
          <g key={`v-${v.id}`}>
            <circle cx={px} cy={py} r={11} fill={color} fillOpacity={0.14} />
            <circle cx={px} cy={py} r={5} fill={color} fillOpacity={0.95} />
            <text
              x={px}
              y={py - 14}
              textAnchor="middle"
              fontSize={11}
              fill={color}
              fillOpacity={0.85}
              fontFamily="ui-monospace, monospace"
            >
              {v.name}
            </text>
          </g>
        );
      })}

      {/* listener at center, breathing */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={breathR + 6}
        fill={singing ? "#a78bfa" : "#ffffff"}
        fillOpacity={singing ? 0.16 : 0.08}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={breathR}
        fill="#ffffff"
        fillOpacity={0.85}
      />
    </svg>
  );
}
