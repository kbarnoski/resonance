// ─────────────────────────────────────────────────────────────────────────────
// 11888-chorusrooms · render.tsx — the calm room, drawn as inline SVG-DOM.
//
//   A deep slate room holds one jade / moonstone orb per participant, placed where
//   that voice's pointer sits. When the shared bar phase sweeps past a voice's canon
//   slot, its orb BLOOMS — the same bloom, at the same instant, in every tab. Along
//   the bottom runs the shared PHASE RIBBON: a playhead that sweeps 0→1 each bar with
//   a tick for every voice's entry. Because the ribbon is driven by the shared clock,
//   two side-by-side tabs show the playhead in lock-step — the sync, made visible.
//
//   All raw art color lives HERE (jade / moonstone on slate), never in UI chrome.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from "react";
import type { ParticipantKind } from "./types";

// ── the palette — pale jade / moonstone on deep verdant slate ────────────────
const SLATE_CORE = "#0e1c22";
const SLATE_EDGE = "#070d14";
const JADE = "#7fd6b5";
const JADE_BRIGHT = "#a9edcb";
const JADE_DEEP = "#4f9e86";
const MOONSTONE = "#cfe6ee";
const MOONSTONE_DIM = "#8fb3bf";

const VB_W = 1200;
const VB_H = 760;
const RIBBON_Y = 690;
const RIBBON_H = 30;
const RIBBON_X = 90;
const RIBBON_W = VB_W - RIBBON_X * 2;

export interface OrbView {
  id: string;
  kind: ParticipantKind;
  px: number; // 0..1
  py: number; // 0..1
  slot: number; // 0..1
  presence: number; // 0..1
  conducting: boolean;
  pulse: number; // 0..1 bloom since its last canon entry
}

export interface RoomView {
  orbs: OrbView[];
  phase: number; // 0..1 shared bar phase
  breath: number; // slow global luminance breath, ~0.85..1
  level: number; // 0..1 ensemble level (0 when muted)
}

function orbFill(kind: ParticipantKind): string {
  if (kind === "self") return JADE_BRIGHT;
  if (kind === "peer") return JADE;
  return JADE_DEEP;
}

function ChorusRoomImpl({ view }: { view: RoomView }) {
  const { orbs, phase, breath, level } = view;
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <radialGradient id="cr-room" cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor={SLATE_CORE} />
          <stop offset="100%" stopColor={SLATE_EDGE} />
        </radialGradient>
        <radialGradient id="cr-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={MOONSTONE} stopOpacity="0.55" />
          <stop offset="35%" stopColor={JADE} stopOpacity="0.32" />
          <stop offset="100%" stopColor={JADE} stopOpacity="0" />
        </radialGradient>
        <filter id="cr-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#cr-room)" />

      {/* faint concentric room lines — a quiet architecture */}
      {[190, 320, 460].map((r) => (
        <circle
          key={r}
          cx={VB_W / 2}
          cy={330}
          r={r}
          fill="none"
          stroke={MOONSTONE}
          strokeOpacity={0.05 + level * 0.05}
          strokeWidth={1}
        />
      ))}

      {/* participant orbs */}
      {orbs.map((o) => {
        const cx = o.px * VB_W;
        const cy = 40 + o.py * (RIBBON_Y - 120);
        const base = o.kind === "self" ? 17 : 14;
        const r = base + o.pulse * 10 * o.presence;
        const glowR = (46 + o.pulse * 70) * (0.5 + 0.5 * o.presence);
        const glowOp = (0.25 + o.pulse * 0.6) * o.presence * breath;
        const fill = orbFill(o.kind);
        return (
          <g key={o.id}>
            <circle cx={cx} cy={cy} r={glowR} fill="url(#cr-glow)" opacity={glowOp} filter="url(#cr-soft)" />
            {o.conducting ? (
              <circle
                cx={cx}
                cy={cy}
                r={r + 12}
                fill="none"
                stroke={MOONSTONE}
                strokeOpacity={0.55 * breath}
                strokeWidth={1.5}
                strokeDasharray="3 7"
              />
            ) : null}
            <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.35 + 0.6 * o.presence} />
            {o.kind === "self" ? (
              <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={MOONSTONE} strokeOpacity={0.7} strokeWidth={1.5} />
            ) : null}
            {o.kind === "self" ? (
              <text
                x={cx}
                y={cy + r + 20}
                textAnchor="middle"
                fontSize="13"
                fontFamily="ui-monospace, monospace"
                letterSpacing="2"
                fill={MOONSTONE}
                fillOpacity={0.8}
              >
                you
              </text>
            ) : null}
          </g>
        );
      })}

      {/* ── shared phase ribbon ───────────────────────────────────────────── */}
      <g>
        <rect
          x={RIBBON_X}
          y={RIBBON_Y}
          width={RIBBON_W}
          height={RIBBON_H}
          rx={RIBBON_H / 2}
          fill={MOONSTONE}
          fillOpacity={0.06}
          stroke={MOONSTONE}
          strokeOpacity={0.12}
        />
        {/* canon-slot ticks — one per voice */}
        {orbs.map((o) => {
          const x = RIBBON_X + o.slot * RIBBON_W;
          const near = 1 - Math.min(1, Math.abs(o.slot - phase) * 6);
          return (
            <circle
              key={`t-${o.id}`}
              cx={x}
              cy={RIBBON_Y + RIBBON_H / 2}
              r={3 + near * 3 + o.pulse * 3}
              fill={orbFill(o.kind)}
              opacity={(0.35 + 0.55 * near) * o.presence}
            />
          );
        })}
        {/* the sweeping playhead — identical across every synced tab */}
        <g transform={`translate(${RIBBON_X + phase * RIBBON_W}, 0)`}>
          <line
            x1={0}
            y1={RIBBON_Y - 10}
            x2={0}
            y2={RIBBON_Y + RIBBON_H + 10}
            stroke={MOONSTONE}
            strokeOpacity={0.75}
            strokeWidth={2}
          />
          <circle cx={0} cy={RIBBON_Y + RIBBON_H / 2} r={5} fill={MOONSTONE_DIM} />
        </g>
        <text
          x={RIBBON_X}
          y={RIBBON_Y - 16}
          fontSize="12"
          fontFamily="ui-monospace, monospace"
          letterSpacing="3"
          fill={MOONSTONE}
          fillOpacity={0.4}
        >
          SHARED BAR
        </text>
      </g>
    </svg>
  );
}

export const ChorusRoom = memo(ChorusRoomImpl);
