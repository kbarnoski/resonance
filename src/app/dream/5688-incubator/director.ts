// ── Incubator · director.ts ─────────────────────────────────────────────────
// The dream as a MIND WITH SHIFTING WANTS. This file holds the whole
// utility-AI / blackboard director plus the Canvas2D tableaux for each
// scene-archetype. No React, no DOM chrome — pure logic + draw functions.
//
// Blackboard  : a vector of continuous DRIVES that ebb and flow.
// Scenes      : ~8 hypnagogic tableaux, each with a UTILITY PROFILE saying how
//               much it satisfies each drive.
// Selection   : every few seconds we score all scenes against the live drive
//               vector (+ seeded noise − recency penalty) and pick the best.
// Seed motif  : a short note-phrase + glyph, chosen once, that RECURS and
//               TRANSFORMS whenever the returnToSeedMotif drive peaks (TDI).
//
// Determinism : every random draw goes through mulberry32(0x5688). No bare
//               Math.random, no argless Date.now.

// ── PRNG ────────────────────────────────────────────────────────────────────
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

export const SEED = 0x5688;

// ── Music helpers ───────────────────────────────────────────────────────────
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── Drives (the blackboard) ─────────────────────────────────────────────────
export type DriveKey =
  | "seekCalm"
  | "seekNovelty"
  | "returnToSeedMotif"
  | "deepen"
  | "settle";

export const DRIVE_KEYS: DriveKey[] = [
  "seekCalm",
  "seekNovelty",
  "returnToSeedMotif",
  "deepen",
  "settle",
];

export const DRIVE_LABEL: Record<DriveKey, string> = {
  seekCalm: "seek calm",
  seekNovelty: "seek novelty",
  returnToSeedMotif: "return to seed",
  deepen: "deepen",
  settle: "settle",
};

// ── Scenes ──────────────────────────────────────────────────────────────────
export interface Palette {
  bg0: string;
  bg1: string;
  ink: string;
  accent: string;
}

export interface SceneDef {
  id: string;
  name: string;
  blurb: string;
  // How strongly running THIS scene satisfies each drive (0..1).
  satisfies: Record<DriveKey, number>;
  carriesMotif: boolean;
  root: number; // MIDI root for the pad chord
  mode: number[]; // scale degrees in semitones from root
  wave: OscillatorType;
  palette: Palette;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, d: DrawCtx) => void;
}

// Everything a draw function needs — no rng calls inside draws (keeps the
// selection PRNG stream deterministic), only smooth functions of time + assets.
export interface DrawCtx {
  t: number; // global seconds
  local: number; // seconds since this scene began
  depth: number; // 0 drowsy → 1 near-sleep
  alpha: number; // dissolve opacity for this layer
  glyph: Glyph;
  assets: Assets;
  flash: number; // 0..1 momentary luminance lift (hypnic jerk), soft + brief
}

// ── Precomputed deterministic assets (built once from the PRNG) ──────────────
export interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}
export interface Blob {
  x: number;
  y: number;
  r: number;
  ph: number;
  sp: number;
}
export interface FaceMark {
  x: number;
  y: number;
  s: number;
  ph: number;
  tilt: number;
}
export interface Fragment {
  x: number;
  y: number;
  w: number;
  ph: number;
}
export interface Assets {
  stars: Star[];
  blobs: Blob[];
  faces: FaceMark[];
  fragments: Fragment[];
  hills: number[]; // warped-landscape control heights
}

export function makeAssets(rng: () => number): Assets {
  const stars: Star[] = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: rng(),
      y: rng(),
      r: 0.4 + rng() * 1.6,
      ph: rng() * Math.PI * 2,
    });
  }
  const blobs: Blob[] = [];
  for (let i = 0; i < 6; i++) {
    blobs.push({
      x: 0.2 + rng() * 0.6,
      y: 0.2 + rng() * 0.6,
      r: 0.08 + rng() * 0.14,
      ph: rng() * Math.PI * 2,
      sp: 0.15 + rng() * 0.35,
    });
  }
  const faces: FaceMark[] = [];
  for (let i = 0; i < 5; i++) {
    faces.push({
      x: 0.15 + rng() * 0.7,
      y: 0.2 + rng() * 0.55,
      s: 0.06 + rng() * 0.08,
      ph: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.5,
    });
  }
  const fragments: Fragment[] = [];
  for (let i = 0; i < 7; i++) {
    fragments.push({
      x: 0.1 + rng() * 0.8,
      y: 0.15 + rng() * 0.7,
      w: 0.08 + rng() * 0.22,
      ph: rng() * Math.PI * 2,
    });
  }
  const hills: number[] = [];
  for (let i = 0; i < 9; i++) hills.push(rng());
  return { stars, blobs, faces, fragments, hills };
}

// ── The seed motif ──────────────────────────────────────────────────────────
export interface Glyph {
  points: number; // symmetry
  radii: number[]; // shape signature
  hue: number;
}

export interface Motif {
  degrees: number[]; // scale-degree indices into a scene's mode
  glyph: Glyph;
  baseRoot: number; // MIDI root the phrase was seeded on
}

export function makeMotif(rng: () => number): Motif {
  const len = 3 + Math.floor(rng() * 3); // 3..5 notes
  const degrees: number[] = [];
  for (let i = 0; i < len; i++) degrees.push(Math.floor(rng() * 6));
  const pts = 4 + Math.floor(rng() * 4); // 4..7
  const radii: number[] = [];
  for (let i = 0; i < pts; i++) radii.push(0.55 + rng() * 0.45);
  return { degrees, glyph: { points: pts, radii, hue: 45 + rng() * 20 }, baseRoot: 55 };
}

// A recurrence is the incubated theme resurfacing in a transformed guise.
export type TransformKind =
  | "as-seeded"
  | "transposed"
  | "inverted"
  | "stretched"
  | "retrograde"
  | "re-colored";

export interface Recurrence {
  index: number;
  kind: TransformKind;
  param: number; // semitone shift / stretch factor / hue depending on kind
  t: number;
  degrees: number[]; // the transformed phrase (degree indices)
  stretch: number; // note-duration multiplier
  hue: number;
}

const TRANSFORM_CYCLE: TransformKind[] = [
  "as-seeded",
  "transposed",
  "inverted",
  "stretched",
  "re-colored",
  "retrograde",
];

// Produce the next transformed guise of the motif.
export function makeRecurrence(
  motif: Motif,
  index: number,
  t: number,
  rng: () => number,
): Recurrence {
  const kind = TRANSFORM_CYCLE[index % TRANSFORM_CYCLE.length];
  let degrees = motif.degrees.slice();
  let param = 0;
  let stretch = 1;
  let hue = motif.glyph.hue;
  switch (kind) {
    case "transposed":
      param = [-5, -3, 2, 4, 5][Math.floor(rng() * 5)];
      degrees = degrees.map((d) => d + Math.round(param / 2));
      break;
    case "inverted": {
      const pivot = degrees[0];
      degrees = degrees.map((d) => pivot - (d - pivot));
      break;
    }
    case "stretched":
      stretch = 1.6 + rng() * 0.9;
      param = stretch;
      break;
    case "retrograde":
      degrees = degrees.slice().reverse();
      break;
    case "re-colored":
      param = Math.floor(rng() * 300);
      hue = param;
      break;
    default:
      break;
  }
  return { index, kind, param, t, degrees, stretch, hue };
}

export function transformLabel(r: Recurrence): string {
  switch (r.kind) {
    case "transposed":
      return `transposed ${r.param > 0 ? "+" : ""}${r.param}`;
    case "inverted":
      return "inverted";
    case "stretched":
      return `time-stretched ×${r.stretch.toFixed(1)}`;
    case "retrograde":
      return "retrograde";
    case "re-colored":
      return `re-colored ${Math.round(r.hue)}°`;
    default:
      return "as seeded";
  }
}

// ── Blackboard state ────────────────────────────────────────────────────────
export interface Drives {
  seekCalm: number;
  seekNovelty: number;
  returnToSeedMotif: number;
  deepen: number;
  settle: number;
}

export interface SceneScore {
  id: string;
  name: string;
  score: number;
}

export interface Director {
  rng: () => number;
  drives: Drives;
  depth: number;
  t: number;
  sceneIdx: number;
  prevIdx: number;
  sceneStart: number; // t when current scene began
  transStart: number; // t when the current dissolve began
  transDur: number; // dissolve duration (s)
  dwell: number; // target dwell for current scene
  lastScores: SceneScore[];
  reason: string; // which drive most drove the last pick
  recent: number[]; // recent scene indices for recency penalty
  nextDecision: number; // t of next selection
  motif: Motif;
  motifWave: number; // the returnToSeedMotif slow reassertion phase driver
  recurrences: Recurrence[];
  nextJerk: number; // t of next hypnic jerk
  flash: number; // current jerk luminance (decays)
  jerkCount: number;
  assets: Assets;
  pendingMotif: Recurrence | null; // set on a recurrence; page consumes for audio
}

const MOTIF_PERIOD = 26; // seconds between incubation reassertions (slow)
const MOTIF_FIRE = 0.72; // pressure threshold that triggers a recurrence

export function makeDirector(): Director {
  const rng = mulberry32(SEED);
  const assets = makeAssets(rng);
  const motif = makeMotif(rng);
  return {
    rng,
    drives: {
      seekCalm: 0.35,
      seekNovelty: 0.4,
      returnToSeedMotif: 0.2,
      deepen: 0.05,
      settle: 0.0,
    },
    depth: 0,
    t: 0,
    sceneIdx: 0,
    prevIdx: 0,
    sceneStart: 0,
    transStart: -10,
    transDur: 2.6,
    dwell: 5.5,
    lastScores: [],
    reason: "seekNovelty",
    recent: [0],
    nextDecision: 5.5,
    motif,
    motifWave: 0,
    recurrences: [],
    nextJerk: 22 + rng() * 20,
    flash: 0,
    jerkCount: 0,
    assets,
    pendingMotif: null,
  };
}

const DEPTH_ARC = 200; // seconds to approach near-sleep

// Depth-dependent weighting of drives during scoring: deeper sleep leans on
// calm + deepen, drifts away from novelty, transitions dwell longer.
function driveWeights(depth: number): Record<DriveKey, number> {
  return {
    seekCalm: 1 + depth * 1.3,
    seekNovelty: 1 - depth * 0.55,
    returnToSeedMotif: 1 + depth * 0.35,
    deepen: 0.5 + depth * 1.7,
    settle: 1.4,
  };
}

// Score every scene against the current drive vector (+ seeded noise −
// recency penalty). Pure w.r.t. the director except it draws from rng.
export function scoreScenes(dir: Director, scenes: SceneDef[]): SceneScore[] {
  const w = driveWeights(dir.depth);
  const out: SceneScore[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    let sc = 0;
    for (const k of DRIVE_KEYS) sc += dir.drives[k] * w[k] * s.satisfies[k];
    sc += (dir.rng() - 0.5) * 0.22; // seeded exploration noise
    // recency penalty: strong for the current scene, softer for recent ones
    const recentPos = dir.recent.lastIndexOf(i);
    if (i === dir.sceneIdx) sc -= 0.9;
    else if (recentPos >= 0) sc -= 0.28 * (recentPos + 1) / dir.recent.length;
    out.push({ id: s.id, name: s.name, score: sc });
  }
  return out;
}

// Advance the blackboard by dt seconds. Returns the (possibly new) scene index.
export function stepDirector(dir: Director, dt: number, scenes: SceneDef[]): void {
  dir.t += dt;
  dir.depth = Math.min(1, dir.t / DEPTH_ARC);
  const d = dir.drives;
  const scene = scenes[dir.sceneIdx];

  // ── drive dynamics ──
  // seekCalm rises with time/depth, bled off by a calming scene.
  d.seekCalm += dt * (0.03 + 0.05 * dir.depth);
  d.seekCalm -= dt * scene.satisfies.seekCalm * 0.14;
  // seekNovelty accrues the longer we dwell.
  d.seekNovelty += dt * 0.055;
  // deepen tracks depth.
  d.deepen += (dir.depth - d.deepen) * Math.min(1, dt * 0.5);
  // settle decays; a settling scene helps it fade.
  d.settle -= dt * (0.12 + scene.satisfies.settle * 0.18);
  // returnToSeedMotif: slow incubation reassertion (rises on a cycle).
  dir.motifWave += dt;
  const cyc = 0.5 - 0.5 * Math.cos((dir.motifWave * Math.PI * 2) / MOTIF_PERIOD);
  d.returnToSeedMotif += dt * (0.02 + 0.09 * cyc);

  clampDrives(d);

  // ── hypnic jerk ── rare, abrupt, single (no repeating flash).
  if (dir.t >= dir.nextJerk) {
    dir.jerkCount++;
    dir.flash = 1;
    d.settle = 1;
    d.deepen = Math.max(0, d.deepen - 0.25);
    // force an immediate, abrupt transition (short dissolve).
    decide(dir, scenes, true);
    dir.nextJerk = dir.t + 40 + dir.rng() * 45;
  }
  // flash decays smoothly (soft, brief — not a strobe).
  dir.flash = Math.max(0, dir.flash - dt * 1.4);

  // ── incubated-motif recurrence ── when returnToSeedMotif peaks.
  if (d.returnToSeedMotif >= MOTIF_FIRE) {
    const rec = makeRecurrence(
      dir.motif,
      dir.recurrences.length,
      dir.t,
      dir.rng,
    );
    dir.recurrences.push(rec);
    dir.pendingMotif = rec;
    d.returnToSeedMotif = 0.12; // satisfied — theme released, will rebuild
  }

  // ── scene selection ──
  if (dir.t >= dir.nextDecision) decide(dir, scenes, false);
}

function decide(dir: Director, scenes: SceneDef[], abrupt: boolean): void {
  const scores = scoreScenes(dir, scenes);
  dir.lastScores = scores;
  let best = 0;
  for (let i = 1; i < scores.length; i++)
    if (scores[i].score > scores[best].score) best = i;

  // Why did it win? Name the drive contributing most to the chosen scene.
  const chosen = scenes[best];
  const w = driveWeights(dir.depth);
  let topDrive: DriveKey = "seekCalm";
  let topVal = -Infinity;
  for (const k of DRIVE_KEYS) {
    const v = dir.drives[k] * w[k] * chosen.satisfies[k];
    if (v > topVal) {
      topVal = v;
      topDrive = k;
    }
  }
  dir.reason = topDrive;

  if (best !== dir.sceneIdx) {
    dir.prevIdx = dir.sceneIdx;
    dir.sceneIdx = best;
    dir.sceneStart = dir.t;
    dir.transStart = dir.t;
    dir.transDur = abrupt ? 0.35 : 2.2 + dir.depth * 1.6;
    // satisfy novelty by switching (more so for high-novelty scenes).
    dir.drives.seekNovelty = Math.max(
      0,
      dir.drives.seekNovelty - chosen.satisfies.seekNovelty * 0.65,
    );
    dir.recent.push(best);
    if (dir.recent.length > 4) dir.recent.shift();
  }
  // deeper → dwell longer; jerks re-settle quickly.
  dir.dwell = (abrupt ? 3.5 : 5) + dir.depth * 7;
  dir.nextDecision = dir.t + dir.dwell;
}

function clampDrives(d: Drives): void {
  d.seekCalm = clamp01(d.seekCalm);
  d.seekNovelty = clamp01(d.seekNovelty);
  d.returnToSeedMotif = clamp01(d.returnToSeedMotif);
  d.deepen = clamp01(d.deepen);
  d.settle = clamp01(d.settle);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Current dissolve progress 0..1 for the active scene layer.
export function transitionAlpha(dir: Director): number {
  const p = (dir.t - dir.transStart) / dir.transDur;
  return p >= 1 ? 1 : p < 0 ? 0 : p;
}

// ── Draw helpers ────────────────────────────────────────────────────────────
function paintBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Palette,
  d: DrawCtx,
): void {
  const g = ctx.createRadialGradient(
    w * (0.5 + 0.08 * Math.sin(d.t * 0.05)),
    h * (0.42 + 0.05 * Math.cos(d.t * 0.04)),
    0,
    w * 0.5,
    h * 0.5,
    Math.hypot(w, h) * 0.7,
  );
  const lift = d.flash * 0.35;
  g.addColorStop(0, mix(p.bg1, "#ffffff", lift));
  g.addColorStop(1, mix(p.bg0, "#ffffff", lift * 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// linear hex mix
function mix(a: string, b: string, t: number): string {
  const ca = hex(a);
  const cb = hex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hex(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

// Draw the seed glyph (a soft closed spiro) — reused across recurrences.
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  glyph: Glyph,
  rot: number,
  hue: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const seg = glyph.radii[i % glyph.radii.length];
    const r =
      radius *
      (0.62 + 0.38 * seg) *
      (0.85 + 0.15 * Math.cos(a * glyph.points));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = `hsla(${hue}, 70%, 72%, ${alpha})`;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = `hsla(${hue}, 80%, 65%, ${alpha * 0.8})`;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();
}

// ── Scene tableaux ──────────────────────────────────────────────────────────
function drawDriftingForms(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.drift, d);
  ctx.globalCompositeOperation = "lighter";
  for (const b of d.assets.blobs) {
    const x = (b.x + 0.06 * Math.sin(d.t * b.sp + b.ph)) * w;
    const y = (b.y + 0.06 * Math.cos(d.t * b.sp * 0.8 + b.ph)) * h;
    const r = b.r * Math.min(w, h) * (1 + 0.12 * Math.sin(d.t * 0.3 + b.ph));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(150,130,255,0.22)");
    g.addColorStop(0.6, "rgba(120,90,200,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawRecedingCorridor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.corridor, d);
  const cx = w * 0.5;
  const cy = h * (0.46 + 0.03 * Math.sin(d.t * 0.1));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = 16;
  for (let i = 0; i < n; i++) {
    const z = ((i / n + (d.t * 0.05) % 1) % 1);
    const scale = Math.pow(z, 1.7);
    const rw = w * 0.75 * scale;
    const rh = h * 0.62 * scale;
    const a = 0.16 * (1 - z);
    ctx.strokeStyle = `rgba(190,170,255,${a})`;
    ctx.lineWidth = 1 + 2 * (1 - z);
    ctx.beginPath();
    ctx.rect(cx - rw / 2, cy - rh / 2, rw, rh);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFacesInDark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.faces, d);
  for (const f of d.assets.faces) {
    // faces surface and recede — never fully resolved (Mavromatis's "faces").
    const pres = 0.5 + 0.5 * Math.sin(d.t * 0.22 + f.ph);
    if (pres < 0.2) continue;
    const a = (pres - 0.2) * 0.5;
    const x = f.x * w;
    const y = f.y * h;
    const s = f.s * Math.min(w, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(f.tilt);
    ctx.strokeStyle = `rgba(230,210,180,${a})`;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = `rgba(230,210,180,${a * 0.7})`;
    ctx.shadowBlur = 14;
    // suggestion of a face: oval + two eyes + a mouth stroke
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.7, s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.28, -s * 0.2, s * 0.08, 0, Math.PI * 2);
    ctx.arc(s * 0.28, -s * 0.2, s * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.24, s * 0.35);
    ctx.quadraticCurveTo(0, s * 0.5, s * 0.24, s * 0.35);
    ctx.stroke();
    ctx.restore();
  }
}

function drawWarpedLandscape(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.land, d);
  const base = h * 0.62;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let layer = 0; layer < 4; layer++) {
    const yOff = base + layer * h * 0.09;
    const a = 0.14 - layer * 0.025;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const u = x / w;
      const warp =
        Math.sin(u * 6 + d.t * 0.2 + layer) * 0.05 +
        Math.sin(u * 13 + d.t * 0.11) * 0.03;
      const y =
        yOff +
        (d.assets.hills[Math.floor(u * 8) % 9] - 0.5) * h * 0.12 +
        warp * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(120,110,200,${a})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawAutobiographical(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.frag, d);
  // Fragmentary "remembered" rectangles surfacing and dissolving.
  for (const f of d.assets.fragments) {
    const pres = 0.5 + 0.5 * Math.sin(d.t * 0.18 + f.ph);
    const a = pres * 0.22;
    const x = f.x * w;
    const y = f.y * h;
    const fw = f.w * w;
    const fh = fw * 0.62;
    ctx.save();
    ctx.strokeStyle = `rgba(220,200,150,${a})`;
    ctx.fillStyle = `rgba(90,80,140,${a * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - fw / 2, y - fh / 2, fw, fh);
    ctx.fill();
    ctx.stroke();
    // a couple of "text" strokes to imply a memory
    ctx.strokeStyle = `rgba(220,210,190,${a * 0.8})`;
    for (let i = 0; i < 3; i++) {
      const ly = y - fh / 2 + fh * (0.3 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - fw * 0.35, ly);
      ctx.lineTo(x + fw * (0.1 + 0.25 * Math.sin(f.ph + i)), ly);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawLuminousField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.lumin, d);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // a very soft, slow luminance swell — the "luminous-dim" calm pole.
  const cx = w * 0.5;
  const cy = h * 0.48;
  const r = Math.min(w, h) * (0.5 + 0.06 * Math.sin(d.t * 0.12));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(170,160,255,0.16)");
  g.addColorStop(0.5, "rgba(120,110,210,0.08)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  for (const s of d.assets.stars) {
    const a = 0.15 + 0.15 * Math.sin(d.t * 0.4 + s.ph);
    ctx.fillStyle = `rgba(220,220,255,${a})`;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGeometricLattice(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.lattice, d);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cx = w * 0.5;
  const cy = h * 0.5;
  const rings = 5;
  const spokes = 9;
  ctx.strokeStyle = "rgba(180,160,255,0.14)";
  ctx.lineWidth = 1;
  const rot = d.t * 0.05;
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * Math.min(w, h) * 0.42 * (1 + 0.03 * Math.sin(d.t * 0.3 + r));
    ctx.beginPath();
    for (let s = 0; s <= spokes; s++) {
      const a = rot + (s / spokes) * Math.PI * 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  for (let s = 0; s < spokes; s++) {
    const a = rot + (s / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * Math.min(w, h) * 0.42, cy + Math.sin(a) * Math.min(w, h) * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSeedBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: DrawCtx,
): void {
  paintBg(ctx, w, h, SCENE_PALETTES.seed, d);
  // the seed glyph, front and centre, slowly breathing.
  const cx = w * 0.5;
  const cy = h * 0.47;
  const base = Math.min(w, h) * 0.2;
  for (let i = 0; i < 3; i++) {
    const r = base * (1 + i * 0.5) * (1 + 0.05 * Math.sin(d.t * 0.25 + i));
    drawGlyph(
      ctx,
      cx,
      cy,
      r,
      d.glyph,
      d.t * 0.06 + i * 0.4,
      d.glyph.hue,
      0.5 - i * 0.13,
    );
  }
}

// Scene palettes (dim-warped hypnagogic — deep indigo/violet, dim golds).
const SCENE_PALETTES = {
  drift: { bg0: "#070510", bg1: "#141032", ink: "#c9c2ff", accent: "#9a86ff" },
  corridor: { bg0: "#05060f", bg1: "#0e1436", ink: "#bfc8ff", accent: "#8ea0ff" },
  faces: { bg0: "#0a0708", bg1: "#1a1210", ink: "#e6d2b4", accent: "#caa87a" },
  land: { bg0: "#060612", bg1: "#141636", ink: "#c6c2ff", accent: "#8f8ad0" },
  frag: { bg0: "#0a0810", bg1: "#191330", ink: "#dcc896", accent: "#b8a45a" },
  lumin: { bg0: "#08071a", bg1: "#171540", ink: "#d6d2ff", accent: "#aaa0ff" },
  lattice: { bg0: "#060610", bg1: "#120f30", ink: "#c2b6ff", accent: "#9d86ff" },
  seed: { bg0: "#0a0812", bg1: "#191234", ink: "#e8d6a0", accent: "#e0c46a" },
} as const;

// The scene table with utility profiles.
export const SCENES: SceneDef[] = [
  {
    id: "drift",
    name: "drifting forms",
    blurb: "geometric-organic blobs drifting free",
    satisfies: { seekCalm: 0.6, seekNovelty: 0.7, returnToSeedMotif: 0.1, deepen: 0.3, settle: 0.3 },
    carriesMotif: false,
    root: 55,
    mode: [0, 2, 4, 7, 9, 11],
    wave: "sine",
    palette: SCENE_PALETTES.drift,
    draw: drawDriftingForms,
  },
  {
    id: "corridor",
    name: "receding corridor",
    blurb: "a hallway falling away into depth",
    satisfies: { seekCalm: 0.4, seekNovelty: 0.5, returnToSeedMotif: 0.2, deepen: 0.85, settle: 0.2 },
    carriesMotif: false,
    root: 50,
    mode: [0, 2, 3, 5, 7, 10],
    wave: "triangle",
    palette: SCENE_PALETTES.corridor,
    draw: drawRecedingCorridor,
  },
  {
    id: "faces",
    name: "faces in the dark",
    blurb: "faces surface and recede, never resolved",
    satisfies: { seekCalm: 0.1, seekNovelty: 0.9, returnToSeedMotif: 0.3, deepen: 0.4, settle: 0.0 },
    carriesMotif: false,
    root: 53,
    mode: [0, 1, 4, 6, 7, 10],
    wave: "sawtooth",
    palette: SCENE_PALETTES.faces,
    draw: drawFacesInDark,
  },
  {
    id: "land",
    name: "warped landscape",
    blurb: "a horizon that will not hold still",
    satisfies: { seekCalm: 0.7, seekNovelty: 0.4, returnToSeedMotif: 0.2, deepen: 0.6, settle: 0.4 },
    carriesMotif: false,
    root: 48,
    mode: [0, 2, 4, 6, 7, 9],
    wave: "sine",
    palette: SCENE_PALETTES.land,
    draw: drawWarpedLandscape,
  },
  {
    id: "frag",
    name: "autobiographical fragment",
    blurb: "remembered scraps carrying the theme",
    satisfies: { seekCalm: 0.3, seekNovelty: 0.6, returnToSeedMotif: 0.9, deepen: 0.3, settle: 0.2 },
    carriesMotif: true,
    root: 55,
    mode: [0, 2, 4, 7, 9],
    wave: "triangle",
    palette: SCENE_PALETTES.frag,
    draw: drawAutobiographical,
  },
  {
    id: "lumin",
    name: "luminous field",
    blurb: "a soft, weightless glow — deepest calm",
    satisfies: { seekCalm: 0.95, seekNovelty: 0.15, returnToSeedMotif: 0.1, deepen: 0.75, settle: 0.85 },
    carriesMotif: false,
    root: 43,
    mode: [0, 2, 4, 7, 9],
    wave: "sine",
    palette: SCENE_PALETTES.lumin,
    draw: drawLuminousField,
  },
  {
    id: "lattice",
    name: "geometric lattice",
    blurb: "a rotating entoptic grid",
    satisfies: { seekCalm: 0.3, seekNovelty: 0.85, returnToSeedMotif: 0.4, deepen: 0.2, settle: 0.1 },
    carriesMotif: false,
    root: 57,
    mode: [0, 2, 4, 6, 8, 10],
    wave: "sawtooth",
    palette: SCENE_PALETTES.lattice,
    draw: drawGeometricLattice,
  },
  {
    id: "seed",
    name: "seed bloom",
    blurb: "the incubated glyph, front and centre",
    satisfies: { seekCalm: 0.5, seekNovelty: 0.3, returnToSeedMotif: 1.0, deepen: 0.4, settle: 0.3 },
    carriesMotif: true,
    root: 55,
    mode: [0, 2, 4, 7, 9],
    wave: "triangle",
    palette: SCENE_PALETTES.seed,
    draw: drawSeedBloom,
  },
];
