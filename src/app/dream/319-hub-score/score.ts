// score.ts — the Canvas2D living graphic score.
//
// A horizontal "time-river": one lane per connected player, stacked top to
// bottom, coloured by id-hue. Each lane's amplitude trace breathes with that
// voice's live gain. A vertical sweep line marks the wall-clock global phase
// (the visible baton). YOUR lane glows; the conductor's lane carries a baton
// mark. Clinical / Ikeda restraint: thin lines, precise ticks, near-black field.

import {
  JI_RATIOS,
  JI_LABELS,
  CHORD_PROGRESSION,
  type Voice,
  type HarmonyField,
} from "./sync";

export interface DrawState {
  voices: Voice[]; // ordered, includes self + ghosts
  levels: Map<string, number>; // id → 0..1 live breathing level
  phase: number; // wall-clock global phase 0..1
  selfId: string;
  conductorId: string | null;
  field: HarmonyField;
  width: number;
  height: number;
  dpr: number;
}

const BG = "#050507";
const GRID = "rgba(255,255,255,0.05)";
const AXIS = "rgba(255,255,255,0.16)";

export function drawScore(ctx: CanvasRenderingContext2D, s: DrawState) {
  const { width: W, height: H } = s;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const padL = 64;
  const padR = 28;
  const padT = 30;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const chord = CHORD_PROGRESSION[s.field.chordIndex] ?? [0];

  // ── faint horizontal grid: the JI degree lines (pitch axis) ──────────────
  ctx.lineWidth = 1;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (let d = 0; d < JI_RATIOS.length; d++) {
    const y = padT + plotH * (1 - d / (JI_RATIOS.length - 1));
    const active = chord.includes(d);
    ctx.strokeStyle = active ? "rgba(255,255,255,0.14)" : GRID;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)";
    ctx.textAlign = "right";
    ctx.fillText(JI_LABELS[d], padL - 10, y);
  }

  // left axis spine
  ctx.strokeStyle = AXIS;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.stroke();

  // ── per-voice lanes: each voice drawn as a trace on its degree line, with
  //    a breathing band whose half-height tracks its live gain ──────────────
  const n = s.voices.length;
  for (let i = 0; i < n; i++) {
    const v = s.voices[i];
    const level = s.levels.get(v.id) ?? 0.3;
    const isSelf = v.id === s.selfId;
    const isCond = v.id === s.conductorId;
    const y = padT + plotH * (1 - v.degree / (JI_RATIOS.length - 1));
    const band = (4 + level * 26) * (isSelf ? 1.25 : 1);

    const sat = v.isGhost ? 30 : 70;
    const lig = v.isGhost ? 42 : 60;
    const stroke = `hsla(${v.hue}, ${sat}%, ${lig}%, ${isSelf ? 0.95 : 0.7})`;
    const fill = `hsla(${v.hue}, ${sat}%, ${lig}%, ${0.05 + level * 0.14})`;

    // breathing band
    ctx.fillStyle = fill;
    ctx.fillRect(padL, y - band, plotW, band * 2);

    // centre line
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isSelf ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();

    // a precise node at the sweep position, sized by level (the "playhead")
    const px = padL + plotW * s.phase;
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(px, y, 2 + level * 5, 0, Math.PI * 2);
    ctx.fill();

    // label / role markers on the right gutter
    ctx.textAlign = "left";
    ctx.font = isSelf ? "bold 11px ui-monospace, monospace" : "11px ui-monospace, monospace";
    ctx.fillStyle = stroke;
    const tag = `${v.isGhost ? "·" : isSelf ? "you" : v.id.slice(0, 3)}`;
    ctx.fillText(tag, W - padR + 4 > W ? W - 30 : padL + plotW + 6, y);

    if (isCond) {
      // baton mark: a small caret to the left of the lane label
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(padL - 26, y - 5);
      ctx.lineTo(padL - 18, y);
      ctx.lineTo(padL - 26, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── the baton: vertical sweep line at the wall-clock phase ────────────────
  const sweepX = padL + plotW * s.phase;
  const breathPulse = 0.5 - 0.5 * Math.cos(s.phase * Math.PI * 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + breathPulse * 0.35})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sweepX, padT - 6);
  ctx.lineTo(sweepX, padT + plotH + 6);
  ctx.stroke();

  // breathing pulse dot at the top of the sweep — the shared "breath" made visible
  ctx.fillStyle = `rgba(255,255,255,${0.4 + breathPulse * 0.6})`;
  ctx.beginPath();
  ctx.arc(sweepX, padT - 6, 2 + breathPulse * 4, 0, Math.PI * 2);
  ctx.fill();

  // ── header strip: chord + field readout ──────────────────────────────────
  ctx.textAlign = "left";
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  const chordTxt = chord.map((d) => JI_LABELS[d]).join(" · ");
  ctx.fillText(
    `chord ${s.field.chordIndex + 1}/${CHORD_PROGRESSION.length}  [ ${chordTxt} ]   oct ${s.field.octave >= 0 ? "+" : ""}${s.field.octave}   bright ${(s.field.brightness * 100) | 0}%   density ${(s.field.density * 100) | 0}%`,
    padL,
    14,
  );
}
