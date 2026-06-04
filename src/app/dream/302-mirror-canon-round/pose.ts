// pose.ts — body landmarks, ghost keyframes, smoothing, and param extraction
// for 302-mirror-canon-round. Adapted (not imported) from 287-mirror-choir.

// ── D-Dorian chord tones: D2 D3 F3 A3 C4 E4 G4 A4 (warm minor-7 spread) ─────
export const DORIAN_HZ = [73.42, 146.83, 174.61, 220.0, 261.63, 329.63, 392.0, 440.0];

// ── Vocal formant tables (F1, F2, F3 in Hz) — Klatt/Peterson-Barney sung vowels
export type FormantRow = [number, number, number];
export const FORMANTS: Record<string, FormantRow> = {
  oo: [300, 870, 2240],
  oh: [500, 1000, 2500],
  eh: [600, 1700, 2500],
  ah: [800, 1200, 2600],
  ee: [280, 2250, 3000],
};

// ── Landmark indices ──────────────────────────────────────────────────────────
export const LM_NOSE = 0;
export const LM_L_SHOULDER = 11;
export const LM_R_SHOULDER = 12;
export const LM_L_HIP = 23;
export const LM_R_HIP = 24;
export const LM_L_WRIST = 15;
export const LM_R_WRIST = 16;
export const LM_L_ANKLE = 27;
export const LM_R_ANKLE = 28;

export interface Lm {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// ── A frame of derived performance parameters (this is what we record/loop) ──
// Lightweight: pitch (Hz), vowel openness 0..1, height/register 0..1, energy 0..1.
export interface ParamFrame {
  pitch1: number; // left-hand voice Hz
  pitch2: number; // right-hand voice Hz
  openness: number; // 0 closed → 1 ah
  register: number; // body-height register multiplier scalar 0..1
  energy: number; // overall amplitude drive 0..1
  // Compact pose for the mirror ghost (mirrored-x already? no — raw normalized)
  pose: GhostPose;
}

// ── Ghost dancer keyframe poses (normalized 0-1 coords, [x, y] per landmark) ─
export interface GhostPose {
  nose: [number, number];
  lShoulder: [number, number];
  rShoulder: [number, number];
  lHip: [number, number];
  rHip: [number, number];
  lWrist: [number, number];
  rWrist: [number, number];
  lAnkle: [number, number];
  rAnkle: [number, number];
}

export const GHOST_KEYFRAMES: GhostPose[] = [
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.32, 0.48], rWrist: [0.68, 0.48],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.22, 0.10], rWrist: [0.68, 0.50],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  {
    nose: [0.5, 0.12],
    lShoulder: [0.36, 0.27], rShoulder: [0.64, 0.27],
    lHip: [0.42, 0.53], rHip: [0.58, 0.53],
    lWrist: [0.08, 0.28], rWrist: [0.92, 0.28],
    lAnkle: [0.43, 0.88], rAnkle: [0.57, 0.88],
  },
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.26], rShoulder: [0.62, 0.26],
    lHip: [0.42, 0.52], rHip: [0.58, 0.52],
    lWrist: [0.35, 0.46], rWrist: [0.78, 0.08],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  {
    nose: [0.5, 0.12],
    lShoulder: [0.38, 0.27], rShoulder: [0.62, 0.27],
    lHip: [0.42, 0.53], rHip: [0.58, 0.53],
    lWrist: [0.54, 0.40], rWrist: [0.46, 0.40],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  {
    nose: [0.52, 0.13],
    lShoulder: [0.40, 0.27], rShoulder: [0.65, 0.25],
    lHip: [0.44, 0.53], rHip: [0.60, 0.52],
    lWrist: [0.30, 0.50], rWrist: [0.82, 0.12],
    lAnkle: [0.46, 0.88], rAnkle: [0.58, 0.88],
  },
];

// ── A second ghost "performance" keyframe set used to auto-commit demo voices ──
// so the round builds itself with zero sensors. Distinct gestures from above.
export const GHOST_PERF_KEYFRAMES: GhostPose[] = [
  {
    nose: [0.5, 0.14],
    lShoulder: [0.38, 0.28], rShoulder: [0.62, 0.28],
    lHip: [0.42, 0.54], rHip: [0.58, 0.54],
    lWrist: [0.18, 0.18], rWrist: [0.50, 0.50],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  {
    nose: [0.5, 0.14],
    lShoulder: [0.38, 0.28], rShoulder: [0.62, 0.28],
    lHip: [0.42, 0.54], rHip: [0.58, 0.54],
    lWrist: [0.50, 0.40], rWrist: [0.84, 0.20],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
  {
    nose: [0.5, 0.14],
    lShoulder: [0.36, 0.29], rShoulder: [0.64, 0.29],
    lHip: [0.42, 0.55], rHip: [0.58, 0.55],
    lWrist: [0.12, 0.34], rWrist: [0.88, 0.34],
    lAnkle: [0.43, 0.88], rAnkle: [0.57, 0.88],
  },
  {
    nose: [0.5, 0.14],
    lShoulder: [0.38, 0.28], rShoulder: [0.62, 0.28],
    lHip: [0.42, 0.54], rHip: [0.58, 0.54],
    lWrist: [0.40, 0.60], rWrist: [0.60, 0.30],
    lAnkle: [0.44, 0.88], rAnkle: [0.56, 0.88],
  },
];

export const GHOST_CYCLE_S = 16;

// Full 33-landmark array from a compact GhostPose.
export function makeLmArray(pose: GhostPose): Lm[] {
  const arr: Lm[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  arr[LM_NOSE] = { x: pose.nose[0], y: pose.nose[1], z: 0, visibility: 1 };
  arr[LM_L_SHOULDER] = { x: pose.lShoulder[0], y: pose.lShoulder[1], z: 0, visibility: 1 };
  arr[LM_R_SHOULDER] = { x: pose.rShoulder[0], y: pose.rShoulder[1], z: 0, visibility: 1 };
  arr[LM_L_HIP] = { x: pose.lHip[0], y: pose.lHip[1], z: 0, visibility: 1 };
  arr[LM_R_HIP] = { x: pose.rHip[0], y: pose.rHip[1], z: 0, visibility: 1 };
  arr[LM_L_WRIST] = { x: pose.lWrist[0], y: pose.lWrist[1], z: 0, visibility: 1 };
  arr[LM_R_WRIST] = { x: pose.rWrist[0], y: pose.rWrist[1], z: 0, visibility: 1 };
  arr[LM_L_ANKLE] = { x: pose.lAnkle[0], y: pose.lAnkle[1], z: 0, visibility: 1 };
  arr[LM_R_ANKLE] = { x: pose.rAnkle[0], y: pose.rAnkle[1], z: 0, visibility: 1 };
  return arr;
}

// Build a compact GhostPose from a full landmark array (for recording).
export function poseFromLms(lms: Lm[]): GhostPose {
  const pt = (i: number): [number, number] => [lms[i].x, lms[i].y];
  return {
    nose: pt(LM_NOSE),
    lShoulder: pt(LM_L_SHOULDER), rShoulder: pt(LM_R_SHOULDER),
    lHip: pt(LM_L_HIP), rHip: pt(LM_R_HIP),
    lWrist: pt(LM_L_WRIST), rWrist: pt(LM_R_WRIST),
    lAnkle: pt(LM_L_ANKLE), rAnkle: pt(LM_R_ANKLE),
  };
}

// ── Math helpers ──────────────────────────────────────────────────────────────
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smooth(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

export function lerpPose(a: GhostPose, b: GhostPose, t: number): GhostPose {
  const lp = (pa: [number, number], pb: [number, number]): [number, number] =>
    [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t)];
  return {
    nose: lp(a.nose, b.nose),
    lShoulder: lp(a.lShoulder, b.lShoulder), rShoulder: lp(a.rShoulder, b.rShoulder),
    lHip: lp(a.lHip, b.lHip), rHip: lp(a.rHip, b.rHip),
    lWrist: lp(a.lWrist, b.lWrist), rWrist: lp(a.rWrist, b.rWrist),
    lAnkle: lp(a.lAnkle, b.lAnkle), rAnkle: lp(a.rAnkle, b.rAnkle),
  };
}

export function lerpFormants(a: FormantRow, b: FormantRow, t: number): FormantRow {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function smoothLandmarks(current: Lm[], target: Lm[], alpha: number): Lm[] {
  return current.map((c, i) => {
    const t = target[i];
    return {
      x: smooth(c.x, t.x, alpha),
      y: smooth(c.y, t.y, alpha),
      z: smooth(c.z, t.z, alpha),
      visibility: smooth(c.visibility, t.visibility, alpha),
    };
  });
}

// ── Map wrist Y (0=top, 1=bottom) to a Dorian Hz value ───────────────────────
export function wristYToPitch(y: number): number {
  const idx = Math.round((1 - y) * (DORIAN_HZ.length - 1));
  const clamped = Math.max(0, Math.min(DORIAN_HZ.length - 1, idx));
  return DORIAN_HZ[clamped];
}

// ── Vowel from body openness: 0 → "oo", mid → "eh", 1 → "ah" ─────────────────
export function computeFormants(openness: number): FormantRow {
  const { oo, oh, eh, ah } = FORMANTS;
  if (openness < 0.33) return lerpFormants(oo, oh, openness / 0.33);
  if (openness < 0.66) return lerpFormants(oh, eh, (openness - 0.33) / 0.33);
  return lerpFormants(eh, ah, (openness - 0.66) / 0.34);
}

export function computeOpenness(lms: Lm[]): number {
  const ls = lms[LM_L_SHOULDER];
  const rs = lms[LM_R_SHOULDER];
  const lw = lms[LM_L_WRIST];
  const rw = lms[LM_R_WRIST];
  const shoulderSpan = Math.abs(rs.x - ls.x);
  const wristSpan = Math.abs(rw.x - lw.x);
  const raw = Math.min(1, wristSpan / Math.max(shoulderSpan + 0.01, 0.15));
  return Math.max(0, Math.min(1, raw));
}

export function computeBodyHeight(lms: Lm[]): number {
  const nose = lms[LM_NOSE];
  const lankl = lms[LM_L_ANKLE];
  const rankl = lms[LM_R_ANKLE];
  const topY = nose.y;
  const bottomY = Math.max(lankl.y, rankl.y);
  return Math.max(0, Math.min(1, bottomY - topY));
}

// Overall energy: how high the wrists are raised (raised hands = more drive).
export function computeEnergy(lms: Lm[]): number {
  const lw = lms[LM_L_WRIST];
  const rw = lms[LM_R_WRIST];
  const sh = (lms[LM_L_SHOULDER].y + lms[LM_R_SHOULDER].y) / 2;
  // wrists above shoulders → energetic. y smaller = higher.
  const lift = Math.max(0, sh - Math.min(lw.y, rw.y));
  return Math.max(0.25, Math.min(1, 0.35 + lift * 2.2));
}

// Extract a full ParamFrame from a smoothed landmark array.
export function extractParams(lms: Lm[]): ParamFrame {
  const openness = computeOpenness(lms);
  const bodyH = computeBodyHeight(lms);
  const register = lerp(0.75, 1.0, Math.min(1, bodyH / 0.65));
  return {
    pitch1: wristYToPitch(lms[LM_L_WRIST].y),
    pitch2: wristYToPitch(lms[LM_R_WRIST].y),
    openness,
    register,
    energy: computeEnergy(lms),
    pose: poseFromLms(lms),
  };
}

// Ghost pose interpolation over a keyframe set.
export function stepGhostPose(keys: GhostPose[], t: number, cycleS: number): GhostPose {
  const n = keys.length;
  const frac = ((t % cycleS) + cycleS) % cycleS / cycleS;
  const pos = frac * n;
  const idx = Math.floor(pos) % n;
  const nextIdx = (idx + 1) % n;
  const segT = pos - Math.floor(pos);
  const st = segT * segT * (3 - 2 * segT);
  return lerpPose(keys[idx], keys[nextIdx], st);
}
