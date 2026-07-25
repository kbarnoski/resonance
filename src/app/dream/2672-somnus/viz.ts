// ════════════════════════════════════════════════════════════════════════════
// 2672 — SOMNUS · SVG nocturne geometry
//
// Pure geometry builders (no React, no DOM) for the two-panel visualisation:
//   1. a hypnogram ribbon — the stage descending/rising across the night
//   2. a memory-strata diagram — each motif a horizontal thread whose
//      thickness/brightness = current strength, marked with birth / replay /
//      forget / recapitulation events and dream-splice parent links.
// Hex colours are the ART layer only (violet ramp), never UI chrome.
// ════════════════════════════════════════════════════════════════════════════

import type { Memory, Segment, Stage } from "./engine";

export const VIEW_W = 1000;
export const VIEW_H = 648;

export const HY = { x0: 96, x1: 968, y0: 44, y1: 196 };
export const MEM = { x0: 96, x1: 968, y0: 262, y1: 612 };

// art-layer palette (violet ramp + magenta / indigo neighbours)
export const COL = {
  wake: "#c4b5fd",
  rem: "#b043e0",
  n1: "#a78bfa",
  n2: "#6366f1",
  n3: "#6d3fd6",
  grid: "#241147",
  dream: "#c05cde",
  wakeThread: "#a78bfa",
  recap: "#ede9fe",
  forget: "#4b4b52",
};

const LEVEL: Record<Stage, number> = {
  WAKE: 0,
  REM: 0.72,
  N1: 1.35,
  N2: 2.15,
  N3: 3.0,
};

export const STAGE_ROWS: { stage: Stage; label: string }[] = [
  { stage: "WAKE", label: "WAKE" },
  { stage: "REM", label: "REM" },
  { stage: "N1", label: "N1" },
  { stage: "N2", label: "N2" },
  { stage: "N3", label: "N3" },
];

export function stageColor(stage: Stage): string {
  return stage === "WAKE"
    ? COL.wake
    : stage === "REM"
      ? COL.rem
      : stage === "N1"
        ? COL.n1
        : stage === "N2"
          ? COL.n2
          : COL.n3;
}

export function timeToX(t: number, total: number): number {
  const f = Math.max(0, Math.min(1, t / total));
  return HY.x0 + f * (HY.x1 - HY.x0);
}

export function stageRowY(stage: Stage): number {
  return HY.y0 + (LEVEL[stage] / 3) * (HY.y1 - HY.y0);
}

/** Stepped hypnogram: a line following the stage, plus a filled area beneath. */
export function buildHypnogram(
  segments: Segment[],
  total: number,
): { line: string; fill: string } {
  const pts: [number, number][] = [];
  for (const s of segments) {
    const y = stageRowY(s.stage);
    pts.push([timeToX(s.start, total), y]);
    pts.push([timeToX(s.end, total), y]);
  }
  if (!pts.length) return { line: "", fill: "" };
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const fill =
    `M${pts[0][0].toFixed(1)} ${HY.y1.toFixed(1)} ` +
    pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") +
    ` L${pts[pts.length - 1][0].toFixed(1)} ${HY.y1.toFixed(1)} Z`;
  return { line, fill };
}

export interface EventMark {
  x: number;
  y: number;
  kind: "birth" | "replay" | "recap" | "forget";
}

export interface ParentLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MemThread {
  id: number;
  label: string;
  origin: "wake" | "dream";
  x0: number;
  xNow: number;
  y: number;
  width: number;
  color: string;
  opacity: number;
  dashed: boolean;
  forgotten: boolean;
  isRecap: boolean;
  strength: number;
  marks: EventMark[];
  links: ParentLink[];
  showLabel: boolean;
}

/** Build the memory-strata threads for the current night-time `t`. */
export function buildThreads(
  memories: Memory[],
  total: number,
  t: number,
  recapId: number | null,
): MemThread[] {
  const n = Math.max(memories.length, 1);
  const laneH = Math.min(22, (MEM.y1 - MEM.y0) / n);
  const yOf = (idx: number) => MEM.y0 + (idx + 0.5) * laneH;
  const nowX = timeToX(Math.min(t, total), total);

  const threads: MemThread[] = [];
  memories.forEach((m, idx) => {
    const y = yOf(idx);
    const x0 = timeToX(m.bornAt, total);
    const xNow = m.forgotten ? timeToX(m.forgottenAt ?? t, total) : nowX;
    const isRecap = recapId === m.id;
    const strength = m.strength;
    const width = Math.min(laneH * 0.82, 1 + strength * 2.6);
    const base = m.origin === "dream" ? COL.dream : COL.wakeThread;
    const opacity = m.forgotten
      ? 0.22
      : Math.max(0.28, Math.min(1, 0.32 + strength * 0.42));

    const marks: EventMark[] = [];
    for (const e of m.events) {
      if (e.t > t) continue;
      const ex = Math.min(timeToX(e.t, total), xNow);
      if (e.kind === "birth") marks.push({ x: x0, y, kind: "birth" });
      else if (e.kind === "replay") marks.push({ x: ex, y, kind: "replay" });
      else if (e.kind === "recap") marks.push({ x: ex, y, kind: "recap" });
      else if (e.kind === "forget") marks.push({ x: ex, y, kind: "forget" });
    }

    const links: ParentLink[] = [];
    if (m.parents && m.bornAt <= t) {
      for (const pid of m.parents) {
        const pIdx = memories.findIndex((mm) => mm.id === pid);
        if (pIdx >= 0) links.push({ x1: x0, y1: y, x2: x0, y2: yOf(pIdx) });
      }
    }

    threads.push({
      id: m.id,
      label: m.label,
      origin: m.origin,
      x0,
      xNow,
      y,
      width,
      color: isRecap ? COL.recap : base,
      opacity: isRecap ? 1 : opacity,
      dashed: m.origin === "dream",
      forgotten: m.forgotten,
      isRecap,
      strength,
      marks,
      links,
      showLabel: xNow - x0 > 26 || isRecap,
    });
  });
  return threads;
}
