// Rhythm-wheel geometry, the latency→subdivision snap engine, the pentatonic
// pitch map, and the Canvas2D renderer for 3144-latency.
//
// Timing is a shared transport: one wheel revolution == one bar (4 beats) at
// 90 BPM. A tap's angle encodes WHEN it landed in the bar; the round-trip
// network latency is measured, snapped to the nearest rhythmic subdivision,
// and drawn as the angular GAP between a note and its delayed echo — so the
// lag reads as a deliberate canon interval instead of a defect.

export const BPM = 90;
export const BEAT_MS = 60000 / BPM; // 666.67 ms
export const BAR_MS = 4 * BEAT_MS; // 2666.67 ms — one revolution
export const SUBDIVS = 16; // sixteenth-note grid around the wheel
export const TWO_PI = Math.PI * 2;
export const TOP = -Math.PI / 2; // screen angle of the downbeat (12 o'clock)

/** Deterministic PRNG — seeded, never Math.random (house rule). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canon intervals we snap a measured latency onto, as fractions of a beat. */
export const CANON_STEPS = [
  { beats: 0.125, label: "1/32" },
  { beats: 0.25, label: "1/16" },
  { beats: 0.375, label: "dotted 1/16" },
  { beats: 0.5, label: "1/8" },
  { beats: 0.75, label: "dotted 1/8" },
  { beats: 1, label: "1/4" },
] as const;

export interface SnapResult {
  rawMs: number;
  snappedMs: number;
  label: string;
  /** Snapped delay as a fraction of the whole bar (0..1). */
  barFraction: number;
  /** Angular gap of the canon interval, radians. */
  angle: number;
}

/** Snap a raw round-trip latency (ms) to the nearest rhythmic subdivision. */
export function snapLatency(rawMs: number): SnapResult {
  let best: (typeof CANON_STEPS)[number] = CANON_STEPS[0];
  let bestErr = Infinity;
  for (const step of CANON_STEPS) {
    const err = Math.abs(step.beats * BEAT_MS - rawMs);
    if (err < bestErr) {
      bestErr = err;
      best = step;
    }
  }
  const snappedMs = best.beats * BEAT_MS;
  const barFraction = snappedMs / BAR_MS;
  return {
    rawMs,
    snappedMs,
    label: best.label,
    barFraction,
    angle: barFraction * TWO_PI,
  };
}

/** D-major-pentatonic across ~2.5 octaves, ascending. Rhythmic stakes, not
 *  melodic — every subdivision maps to a consonant note so only TIMING can be
 *  "wrong". */
export const SCALE = [
  146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88,
  587.33,
];

export function pitchIndexForSubdiv(subdiv: number): number {
  return Math.round((subdiv / (SUBDIVS - 1)) * (SCALE.length - 1));
}

/** Screen angle for a fraction of the bar (0..1), downbeat at 12 o'clock. */
export function angleForFraction(frac: number): number {
  return TOP + frac * TWO_PI;
}

/** Screen angle at a wall-clock (performance.now) instant. */
export function angleForPerf(perf: number, perfStart: number): number {
  const frac = (((perf - perfStart) % BAR_MS) + BAR_MS) % BAR_MS;
  return angleForFraction(frac / BAR_MS);
}

/** Screen angle of a subdivision index. */
export function subdivAngle(subdiv: number): number {
  return angleForFraction(subdiv / SUBDIVS);
}

/** Nearest subdivision + off-grid error (0 = dead on, 1 = worst, mid-cell). */
export function quantizeAngle(angle: number): { subdiv: number; offGrid: number } {
  const frac = (((angle - TOP) % TWO_PI) + TWO_PI) % TWO_PI / TWO_PI;
  const raw = frac * SUBDIVS;
  const subdiv = Math.round(raw) % SUBDIVS;
  const cellErr = Math.abs(raw - Math.round(raw)); // 0..0.5
  return { subdiv, offGrid: Math.min(1, cellErr / 0.5) };
}

export type Band = "local" | "remote";
export type Kind = "orig" | "echo" | "ghost";

export interface Mark {
  band: Band;
  kind: Kind;
  angle: number; // screen radians (echoes carry parent + snap, unwrapped)
  parentAngle?: number; // echoes only, for the connecting canon-gap arc
  born: number; // performance.now when it should appear
  ttl: number;
  offGrid: number; // 0..1
}

export interface DrawState {
  marks: Mark[];
  now: number;
  playheadAngle: number;
  cx: number;
  cy: number;
  R: number;
  rL: number; // local band radius
  rR: number; // remote band radius
  snapAngle: number;
  lock: number; // 0..1 rhythmic accuracy
}

const LOCAL_HUE = "#a78bfa"; // violet-400 — you
const REMOTE_HUE = "#6366f1"; // indigo — the partner
const GHOST_HUE = "#c4b5fd";

function pos(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

export function drawWheel(ctx: CanvasRenderingContext2D, s: DrawState): void {
  const { cx, cy, R, now } = s;

  // Backdrop — near-black violet wash.
  ctx.fillStyle = "#07040e";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const bg = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.5);
  bg.addColorStop(0, "rgba(40,20,80,0.35)");
  bg.addColorStop(1, "rgba(7,4,14,0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.5, 0, TWO_PI);
  ctx.fill();

  // Two faint band rings.
  ctx.lineWidth = 1;
  for (const r of [s.rL, s.rR]) {
    ctx.strokeStyle = "rgba(148,130,200,0.14)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.stroke();
  }

  // Subdivision ticks — bold on the 4 beats.
  for (let i = 0; i < SUBDIVS; i++) {
    const a = subdivAngle(i);
    const beat = i % (SUBDIVS / 4) === 0;
    const inner = beat ? R * 0.9 : R * 0.95;
    const [x1, y1] = pos(cx, cy, inner, a);
    const [x2, y2] = pos(cx, cy, R * 1.0, a);
    ctx.strokeStyle = beat
      ? "rgba(196,181,253,0.55)"
      : "rgba(148,130,200,0.22)";
    ctx.lineWidth = beat ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Marks: originals (solid dots), echoes (hollow rings + canon-gap arc),
  // ghosts (faint pre-snap arrival).
  for (const m of s.marks) {
    const age = now - m.born;
    if (age < 0 || age > m.ttl) continue;
    let a = 1 - age / m.ttl;
    a *= a;
    const flash = age < 170 ? 1 - age / 170 : 0;
    const r = m.band === "local" ? s.rL : s.rR;
    const hue =
      m.kind === "ghost" ? GHOST_HUE : m.band === "local" ? LOCAL_HUE : REMOTE_HUE;

    if (m.kind === "ghost") {
      const [gx, gy] = pos(cx, cy, r, m.angle);
      ctx.fillStyle = GHOST_HUE;
      ctx.globalAlpha = 0.28 * a;
      ctx.beginPath();
      ctx.arc(gx, gy, 3, 0, TWO_PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }

    if (m.kind === "echo" && m.parentAngle !== undefined) {
      // Canon-gap arc from the note to its delayed answer.
      ctx.strokeStyle = hue;
      ctx.globalAlpha = 0.35 * a;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, m.parentAngle, m.angle, false);
      ctx.stroke();
    }

    const [mx, my] = pos(cx, cy, r, m.angle);
    const size = (m.kind === "orig" ? 6.5 : 5) * (1 + 0.7 * flash);
    // Off-grid notes are dimmer + softer — the pattern visibly frays.
    const clarity = 1 - 0.55 * m.offGrid;
    ctx.globalAlpha = a * clarity;
    ctx.shadowBlur = 12 * (1 + flash);
    ctx.shadowColor = hue;
    if (m.kind === "orig") {
      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.arc(mx, my, size, 0, TWO_PI);
      ctx.fill();
    } else {
      ctx.strokeStyle = hue;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, size, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Playhead sweep.
  const [px, py] = pos(cx, cy, R * 1.02, s.playheadAngle);
  ctx.strokeStyle = "rgba(221,214,254,0.85)";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = "#ddd6fe";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, TWO_PI);
  ctx.fillStyle = "#ede9fe";
  ctx.fill();
  ctx.shadowBlur = 0;

  // Center hub — brightness = rhythmic lock ("ringing" when on-grid).
  const hub = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.2);
  const glow = 0.2 + 0.8 * s.lock;
  hub.addColorStop(0, `rgba(167,139,250,${0.5 * glow})`);
  hub.addColorStop(1, "rgba(167,139,250,0)");
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.2, 0, TWO_PI);
  ctx.fill();
}
