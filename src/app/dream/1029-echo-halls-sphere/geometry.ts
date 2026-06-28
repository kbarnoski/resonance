// geometry.ts — pure, DOM-free geometry + harmony math for Echo Halls (Sphere).
//
// This module owns all the spatial + harmonic reasoning so it can be unit-tested
// without a browser. No Web Audio, no WebGL, no React in here. See geometry.test.ts
// for the self-test runner that verifies the assertions documented in the README.

export type Vec3 = readonly [number, number, number];

export interface Room {
  /** Roman-numeral chord function in the C-major neighbourhood. */
  readonly id: "I" | "vi" | "IV" | "ii" | "V" | "iii";
  /** Human label. */
  readonly name: string;
  /** Unit direction from the listener to the room (full sphere). */
  readonly dir: Vec3;
  /** Distance (radius) the room sits at, for the panner position. */
  readonly radius: number;
  /** Accent hue in degrees [0,360) keyed to chord function. */
  readonly hue: number;
  /** Chord pitch classes (0=C .. 11=B). */
  readonly pcs: readonly number[];
}

// ── vector helpers ───────────────────────────────────────────────────────────

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Angular distance (radians) between two directions; inputs need not be unit. */
export function angularDistance(a: Vec3, b: Vec3): number {
  const na = normalize(a);
  const nb = normalize(b);
  const c = Math.max(-1, Math.min(1, dot(na, nb)));
  return Math.acos(c);
}

// ── harmony ──────────────────────────────────────────────────────────────────

/** The C-major diatonic pitch-class set: C D E F G A B. */
export const C_MAJOR_PCS: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Octave-fold a pitch class into a warm low band. Each triad fundamental lands
 * around ~80–220 Hz so nothing is shrill. We anchor C2 (~65.4 Hz) and place
 * pitch classes upward from there, then return the three chord tones.
 */
export function chordFreqs(pcs: readonly number[], baseHz = 65.406): number[] {
  // C2 = 65.406 Hz. A pitch class p sits at base * 2^(p/12) within the octave,
  // which keeps the chord inside roughly one octave above the anchor.
  return pcs.map((p) => baseHz * Math.pow(2, p / 12));
}

export function pcName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

// ── room layout on the full sphere ───────────────────────────────────────────

// Six rooms placed at varied azimuth AND elevation. Hand-tuned so that the set
// spans the full sphere: at least one clearly ABOVE (y > 0.4), one clearly
// BELOW (y < -0.4), and several BEHIND (z > 0 in our convention where -z is
// forward at rest). Directions are normalized on construction.
//
// Convention: +x right, +y up, -z forward (matches WebAudio/WebGL camera-at-rest
// looking down -z).
interface RoomSeed {
  id: Room["id"];
  name: string;
  dir: Vec3;
  hue: number;
  pcs: number[];
}

const ROOM_SEEDS: RoomSeed[] = [
  // I (C-E-G): front, slightly up — the tonic, the "home" you face at start.
  { id: "I", name: "C major (I)", dir: [0.0, 0.18, -1.0], hue: 45, pcs: [0, 4, 7] },
  // V (G-B-D): front-right, level — the bright dominant.
  { id: "V", name: "G major (V)", dir: [0.95, 0.05, -0.55], hue: 195, pcs: [7, 11, 2] },
  // IV (F-A-C): front-left and HIGH ABOVE — subdominant overhead.
  { id: "IV", name: "F major (IV)", dir: [-0.7, 0.85, -0.4], hue: 145, pcs: [5, 9, 0] },
  // vi (A-C-E): behind-left, level — the relative minor, hiding behind you.
  { id: "vi", name: "A minor (vi)", dir: [-0.85, 0.0, 0.75], hue: 280, pcs: [9, 0, 4] },
  // ii (D-F-A): behind-right and LOW BELOW — supertonic underfoot.
  { id: "ii", name: "D minor (ii)", dir: [0.65, -0.9, 0.55], hue: 320, pcs: [2, 5, 9] },
  // iii (E-G-B): directly behind, slightly down — mediant at your back.
  { id: "iii", name: "E minor (iii)", dir: [0.05, -0.25, 1.0], hue: 15, pcs: [4, 7, 11] },
];

export function roomSpherePositions(radius = 6): Room[] {
  return ROOM_SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    dir: normalize(s.dir),
    radius,
    hue: s.hue,
    pcs: s.pcs,
  }));
}

/**
 * Facing weights: a softmax over -angularDistance(forward, room.dir), so the
 * room you look most directly at gets the largest weight, neighbours cross-fade,
 * and the weights always sum to ~1. `sharpness` controls how tight the focus is.
 */
export function facingWeights(
  forward: Vec3,
  rooms: readonly Room[],
  sharpness = 2.2,
): number[] {
  const f = normalize(forward);
  const logits = rooms.map((r) => -angularDistance(f, r.dir) * sharpness);
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/** Index of the room the forward vector is most directly facing. */
export function facedRoomIndex(forward: Vec3, rooms: readonly Room[]): number {
  let best = 0;
  let bestD = Infinity;
  const f = normalize(forward);
  for (let i = 0; i < rooms.length; i++) {
    const d = angularDistance(f, rooms[i].dir);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Build a forward vector from yaw (radians, around +y) and pitch (radians, up
 * positive). At yaw=0,pitch=0 this points down -z (the tonic).
 */
export function forwardFromYawPitch(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return normalize([
    Math.sin(yaw) * cp,
    Math.sin(pitch),
    -Math.cos(yaw) * cp,
  ]);
}
