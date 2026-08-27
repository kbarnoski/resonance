"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RoomCrossSection.tsx — the visual, output as inline SVG / DOM vector only
// (no canvas, no WebGL). It draws an architectural cross-section of the
// convolution: a decaying vault whose ceiling IS the impulse-response envelope
// (the room take's decay), with the two takes laid down as vector strata —
// the voice take threading through the chamber, the room take as bedrock. A
// sweeping sounding-line marks the voice-take playhead; the chamber stains with
// the wet/dry blend. High-key light ground, ink, one saturated magenta accent.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from "react";
import type { Strata } from "./engine";

const W = 1000;
const H = 460;
const FLOOR = 396; // room-take bedrock line
const VOICE_Y = 250; // voice-take stratum centre
const CEIL_TOP = 44; // highest the vault ceiling can spring to
const PAD = 36;

const INK = "#191520";
const INK_SOFT = "#8a8496";
const ACCENT = "#c21a74"; // deep magenta
const GROUND = "#f7f5f1";

function buildCeilingPath(env: number[]): string {
  if (env.length < 2) return "";
  const span = W - PAD * 2;
  const maxH = FLOOR - CEIL_TOP - 20;
  const pts = env.map((e, i) => {
    const x = PAD + (i / (env.length - 1)) * span;
    const y = FLOOR - (0.14 + 0.86 * e) * maxH;
    return [x, y] as const;
  });
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const mx = (px + x) / 2;
    d += ` Q ${px.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${(
      (py + y) /
      2
    ).toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
  return d;
}

/** Filled chamber = area under the ceiling down to the voice stratum. */
function buildChamberPath(env: number[]): string {
  const ceil = buildCeilingPath(env);
  if (!ceil) return "";
  const span = W - PAD * 2;
  return `${ceil} L ${(PAD + span).toFixed(1)} ${VOICE_Y} L ${PAD} ${VOICE_Y} Z`;
}

/** A mirrored waveform stratum band centred on cy. */
function buildStratumPath(peaks: number[], cy: number, amp: number): string {
  if (peaks.length < 2) return "";
  const span = W - PAD * 2;
  const top: string[] = [];
  const bot: string[] = [];
  for (let i = 0; i < peaks.length; i++) {
    const x = PAD + (i / (peaks.length - 1)) * span;
    const h = peaks[i] * amp;
    top.push(`${x.toFixed(1)} ${(cy - h).toFixed(1)}`);
    bot.push(`${x.toFixed(1)} ${(cy + h).toFixed(1)}`);
  }
  return `M ${top.join(" L ")} L ${bot.reverse().join(" L ")} Z`;
}

/** The voice take as a single threading line (not a band). */
function buildThreadPath(peaks: number[], cy: number, amp: number): string {
  if (peaks.length < 2) return "";
  const span = W - PAD * 2;
  let d = "";
  for (let i = 0; i < peaks.length; i++) {
    const x = PAD + (i / (peaks.length - 1)) * span;
    const y = cy - (peaks[i] - 0.5) * 2 * amp;
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d.trim();
}

export interface RoomCrossSectionProps {
  strata: Strata;
  blend: number;
  active: boolean;
  voiceTitle: string;
  roomTitle: string;
  getRms: () => number;
  getPlayheadPct: () => number;
}

export function RoomCrossSection({
  strata,
  blend,
  active,
  voiceTitle,
  roomTitle,
  getRms,
  getPlayheadPct,
}: RoomCrossSectionProps) {
  const playheadRef = useRef<SVGGElement | null>(null);
  const glowRef = useRef<SVGRectElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const ceiling = useMemo(
    () => buildCeilingPath(strata.envelope),
    [strata.envelope],
  );
  const chamber = useMemo(
    () => buildChamberPath(strata.envelope),
    [strata.envelope],
  );
  const bedrock = useMemo(
    () => buildStratumPath(strata.room, FLOOR, 40),
    [strata.room],
  );
  const thread = useMemo(
    () => buildThreadPath(strata.voice, VOICE_Y, 34),
    [strata.voice],
  );

  // Live layer: sweep the sounding-line and pulse the chamber glow. Mutated via
  // refs (not React state) so the frame loop never re-renders the vector body.
  useEffect(() => {
    if (!active) {
      if (playheadRef.current)
        playheadRef.current.setAttribute("opacity", "0");
      return;
    }
    const span = W - PAD * 2;
    const loop = () => {
      const pct = getPlayheadPct();
      const rms = getRms();
      const x = PAD + pct * span;
      if (playheadRef.current) {
        playheadRef.current.setAttribute("opacity", "1");
        playheadRef.current.setAttribute(
          "transform",
          `translate(${x.toFixed(1)} 0)`,
        );
      }
      if (glowRef.current) {
        glowRef.current.setAttribute(
          "opacity",
          (0.05 + rms * 0.45).toFixed(3),
        );
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, getPlayheadPct, getRms]);

  const chamberOpacity = 0.06 + blend * 0.34;
  const empty = strata.envelope.length < 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none rounded-lg border border-border"
      role="img"
      aria-label="Architectural cross-section of the convolution: a decaying vault ceiling drawn from the impulse-response envelope, with the two piano takes as strata."
      style={{ background: GROUND, touchAction: "none" }}
    >
      {/* survey grid */}
      <g stroke={INK} strokeWidth="0.5" opacity="0.08">
        {Array.from({ length: 9 }).map((_, i) => {
          const x = PAD + (i / 8) * (W - PAD * 2);
          return <line key={`v${i}`} x1={x} y1={CEIL_TOP - 10} x2={x} y2={FLOOR + 40} />;
        })}
        {[CEIL_TOP, VOICE_Y, FLOOR].map((y) => (
          <line key={`h${y}`} x1={PAD} y1={y} x2={W - PAD} y2={y} />
        ))}
      </g>

      {empty ? (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fill={INK_SOFT}
          fontSize="18"
          fontFamily="ui-monospace, monospace"
        >
          awaiting his takes…
        </text>
      ) : (
        <>
          {/* the reverberant chamber — stained by the wet/dry blend */}
          <path d={chamber} fill={ACCENT} opacity={chamberOpacity} />
          <rect
            ref={glowRef}
            x={PAD}
            y={CEIL_TOP - 8}
            width={W - PAD * 2}
            height={VOICE_Y - CEIL_TOP + 8}
            fill={ACCENT}
            opacity="0.05"
          />

          {/* ceiling = impulse-response decay envelope (the room's decay) */}
          <path
            d={ceiling}
            fill="none"
            stroke={ACCENT}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          {/* voice take — threads through the chamber */}
          <path
            d={thread}
            fill="none"
            stroke={INK}
            strokeWidth="1.6"
            opacity="0.85"
          />

          {/* room take — bedrock stratum used raw as the IR */}
          <path d={bedrock} fill={INK} opacity="0.9" />

          {/* sounding-line playhead */}
          <g ref={playheadRef} opacity="0">
            <line
              x1="0"
              y1={CEIL_TOP - 12}
              x2="0"
              y2={FLOOR + 40}
              stroke={ACCENT}
              strokeWidth="1.4"
            />
            <circle cx="0" cy={VOICE_Y} r="4.5" fill={ACCENT} />
          </g>

          {/* labels — raw ink/accent are allowed inside the SVG art layer */}
          <g fontFamily="ui-monospace, monospace" fontSize="12.5">
            <text x={PAD} y={CEIL_TOP - 18} fill={ACCENT} letterSpacing="1.5">
              ROOM · IR DECAY — {roomTitle.toUpperCase()}
            </text>
            <text x={PAD} y={VOICE_Y - 46} fill={INK} letterSpacing="1.5">
              VOICE — {voiceTitle.toUpperCase()}
            </text>
            <text
              x={W - PAD}
              y={FLOOR + 30}
              textAnchor="end"
              fill={INK_SOFT}
              letterSpacing="1.5"
            >
              BEDROCK · SAME TAKE, RAW WAVEFORM
            </text>
            <text x={PAD} y={FLOOR + 30} fill={INK_SOFT} letterSpacing="1.5">
              t = 0
            </text>
          </g>
        </>
      )}
    </svg>
  );
}
