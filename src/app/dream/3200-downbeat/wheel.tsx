// ─────────────────────────────────────────────────────────────────────────────
// 3200-downbeat · wheel.tsx
//
//   The SVG transport display (SVG only — no canvas, no WebGL):
//     • a PHASE-WHEEL — a ring with the ensemble's beat marker and the
//       conductor's beat marker; the arc between them IS your timing error.
//     • three scrolling NOTE-LANES (bass / chords / melody) whose upcoming
//       scheduled notes drift left and land on the grid at the "now" line,
//       with the conductor's taps marked on a strip above.
//   All colour comes from the violet art ramp.
// ─────────────────────────────────────────────────────────────────────────────

import { VIOLET, MAGENTA, INDIGO, NEUTRAL } from "../_shared/palette";
import type { Voice } from "./scheduler";

export interface LaneNote {
  time: number;
  dur: number;
  voice: Voice;
  vel: number;
}

export interface FrameData {
  currentTime: number;
  bpm: number;
  phaseErrMs: number;
  confidence: number;
  ensemblePhase: number;
  conductorPhase: number;
  hasConductor: boolean;
  gapFrac: number;
  label: string;
  mode: "demo" | "human";
  notes: LaneNote[];
  taps: number[];
  beatTimes: number[];
  downbeatFlags: boolean[];
}

const CX = 210;
const CY = 250;
const R = 150;

const LANE_X0 = 400;
const LANE_X1 = 980;
const NOW_X = 470;
const PPS = 132; // pixels per second

const LANE_Y: Record<Voice, number> = { melody: 178, chord: 250, bass: 322 };
const VOICE_COLOR: Record<Voice, string> = {
  bass: INDIGO,
  chord: VIOLET[500],
  melody: VIOLET[300],
};
const TAP_Y = 112;

function pointAt(phase: number, radius: number): [number, number] {
  const a = phase * Math.PI * 2;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)];
}

const hx = (v: number) => Math.round(v).toString(16).padStart(2, "0");
function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return `#${hx(pa[0] + (pb[0] - pa[0]) * u)}${hx(pa[1] + (pb[1] - pa[1]) * u)}${hx(
    pa[2] + (pb[2] - pa[2]) * u
  )}`;
}

export function Scene({ frame }: { frame: FrameData }) {
  const {
    currentTime,
    bpm,
    phaseErrMs,
    confidence,
    ensemblePhase,
    conductorPhase,
    hasConductor,
    gapFrac,
    label,
    notes,
    taps,
    beatTimes,
    downbeatFlags,
  } = frame;

  const xOf = (t: number) => NOW_X + (t - currentTime) * PPS;
  const tight = Math.min(1, Math.abs(gapFrac) / 0.22);
  const gapColor = lerpHex(VIOLET[400], MAGENTA, tight);

  // Gap arc between the two markers (shorter way).
  const [ex, ey] = pointAt(ensemblePhase, R);
  const [cx2, cy2] = pointAt(hasConductor ? conductorPhase : ensemblePhase, R);
  const sweep = gapFrac >= 0 ? 1 : 0;
  const gapArc = `M ${ex.toFixed(1)} ${ey.toFixed(1)} A ${R} ${R} 0 0 ${sweep} ${cx2.toFixed(
    1
  )} ${cy2.toFixed(1)}`;

  return (
    <svg
      viewBox="0 0 1000 520"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Conductor phase wheel and ensemble note lanes"
    >
      {/* ── phase wheel ───────────────────────────────────────────────────── */}
      {/* beat sub-ticks */}
      {Array.from({ length: 8 }, (_, i) => {
        const [x1, y1] = pointAt(i / 8, R + 8);
        const [x2, y2] = pointAt(i / 8, R + (i === 0 ? 20 : 14));
        return (
          <line
            key={`tk${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={i === 0 ? VIOLET[300] : NEUTRAL[400]}
            strokeWidth={i === 0 ? 2.5 : 1.5}
          />
        );
      })}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={VIOLET[800]} strokeWidth={10} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={NEUTRAL[200]} strokeWidth={1} />

      {/* confidence — an inner arc that fills as the groove locks */}
      {(() => {
        const [sx, sy] = pointAt(0, R - 26);
        const [px, py] = pointAt(confidence, R - 26);
        const large = confidence > 0.5 ? 1 : 0;
        if (confidence < 0.02) return null;
        return (
          <path
            d={`M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${R - 26} ${R - 26} 0 ${large} 1 ${px.toFixed(
              1
            )} ${py.toFixed(1)}`}
            fill="none"
            stroke={VIOLET[600]}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.55}
          />
        );
      })()}

      {/* the timing-error arc */}
      <path d={gapArc} fill="none" stroke={gapColor} strokeWidth={7} strokeLinecap="round" />

      {/* ensemble marker (filled) */}
      <circle cx={ex} cy={ey} r={11} fill={VIOLET[400]} />
      <circle cx={ex} cy={ey} r={11} fill="none" stroke={VIOLET[100]} strokeWidth={1.5} />
      {/* conductor marker (hollow) */}
      {hasConductor && (
        <circle cx={cx2} cy={cy2} r={9} fill={NEUTRAL[50]} stroke={gapColor} strokeWidth={3} />
      )}

      {/* centre readout */}
      <text
        x={CX}
        y={CY - 12}
        textAnchor="middle"
        fill={NEUTRAL[1000]}
        style={{ font: "600 46px ui-sans-serif, system-ui, sans-serif" }}
      >
        {Math.round(bpm)}
      </text>
      <text
        x={CX}
        y={CY + 12}
        textAnchor="middle"
        fill={NEUTRAL[600]}
        style={{ font: "500 13px ui-monospace, monospace", letterSpacing: "0.18em" }}
      >
        BPM
      </text>
      <text
        x={CX}
        y={CY + 44}
        textAnchor="middle"
        fill={gapColor}
        style={{ font: "500 16px ui-monospace, monospace" }}
      >
        {hasConductor
          ? `${phaseErrMs >= 0 ? "+" : "−"}${Math.abs(Math.round(phaseErrMs))} ms`
          : "—"}
      </text>
      <text
        x={CX}
        y={CY + R + 46}
        textAnchor="middle"
        fill={NEUTRAL[600]}
        style={{ font: "500 13px ui-monospace, monospace", letterSpacing: "0.1em" }}
      >
        {label}
      </text>

      {/* ── note lanes ────────────────────────────────────────────────────── */}
      {/* clip so scrolling notes stay inside the lane window */}
      <defs>
        <clipPath id="laneClip">
          <rect x={LANE_X0} y={90} width={LANE_X1 - LANE_X0} height={290} rx={8} />
        </clipPath>
      </defs>
      <rect
        x={LANE_X0}
        y={90}
        width={LANE_X1 - LANE_X0}
        height={290}
        rx={8}
        fill={VIOLET[950]}
        stroke={NEUTRAL[200]}
        strokeWidth={1}
      />

      <g clipPath="url(#laneClip)">
        {/* grid beat lines */}
        {beatTimes.map((t, i) => {
          const x = xOf(t);
          if (x < LANE_X0 || x > LANE_X1) return null;
          const down = downbeatFlags[i];
          return (
            <line
              key={`bl${i}`}
              x1={x}
              y1={98}
              x2={x}
              y2={372}
              stroke={down ? VIOLET[600] : NEUTRAL[200]}
              strokeWidth={down ? 1.8 : 1}
              opacity={down ? 0.8 : 0.5}
            />
          );
        })}

        {/* conductor taps */}
        {taps.map((t, i) => {
          const x = xOf(t);
          if (x < LANE_X0 || x > LANE_X1) return null;
          return (
            <polygon
              key={`tp${i}`}
              points={`${x - 6},${TAP_Y - 8} ${x + 6},${TAP_Y - 8} ${x},${TAP_Y + 4}`}
              fill={VIOLET[200]}
            />
          );
        })}

        {/* ensemble notes */}
        {notes.map((n, i) => {
          const x = xOf(n.time);
          const w = Math.max(9, n.dur * PPS);
          if (x + w < LANE_X0 || x > LANE_X1) return null;
          const y = LANE_Y[n.voice];
          const landing = Math.abs(n.time - currentTime) < 0.05;
          return (
            <rect
              key={`nt${i}`}
              x={x}
              y={y - 11}
              width={w}
              height={22}
              rx={5}
              fill={VOICE_COLOR[n.voice]}
              opacity={landing ? 1 : 0.42 + n.vel * 0.3}
              stroke={landing ? VIOLET[100] : "none"}
              strokeWidth={landing ? 2 : 0}
            />
          );
        })}
      </g>

      {/* now line — where notes sound */}
      <line x1={NOW_X} y1={92} x2={NOW_X} y2={378} stroke={MAGENTA} strokeWidth={2} />
      <polygon
        points={`${NOW_X - 6},92 ${NOW_X + 6},92 ${NOW_X},100`}
        fill={MAGENTA}
      />

      {/* lane labels */}
      {(["melody", "chord", "bass"] as Voice[]).map((v) => (
        <text
          key={`lb${v}`}
          x={LANE_X0 + 10}
          y={LANE_Y[v] - 18}
          fill={NEUTRAL[400]}
          style={{ font: "500 11px ui-monospace, monospace", letterSpacing: "0.14em" }}
        >
          {v.toUpperCase()}
        </text>
      ))}
      <text
        x={LANE_X0 + 10}
        y={TAP_Y - 14}
        fill={NEUTRAL[400]}
        style={{ font: "500 11px ui-monospace, monospace", letterSpacing: "0.14em" }}
      >
        CONDUCTOR
      </text>
    </svg>
  );
}
