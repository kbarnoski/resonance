// pendulum.ts — the pendulum-wave model + shared Doppler geometry.
//
// A horizontal rail carries N bobs on pendula of GRADUATED length. Their swing
// periods are tuned so that each completes a whole number of oscillations in one
// common cycle (TOTAL_CYCLE): released together they start in unison, fan out
// through every phase relationship, then re-converge. An "ear" sits below the
// rail; each bob's radial velocity toward that ear becomes a real Doppler
// vibrato at the bob's own swing frequency. Everything here is computed in
// stage-NORMALIZED units (rail at y=0, down is +y, x in roughly [-1, 1]) so the
// audio is identical at any screen size; the page renders it to pixels.

// ── deterministic PRNG (seeded, no Math.random / no argless Date) ─────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── stage constants (normalized) ─────────────────────────────────────────────
export const N = 14; // number of bobs
const BASE_OSC = 32; // longest bob completes this many swings per cycle
export const TOTAL_CYCLE = 48; // seconds for a full fan-out → re-convergence
const LEN_MAX = 0.86; // normalized length of the longest (slowest) pendulum
const AMP_BASE = 0.42; // swing half-angle in radians (~24°)
const AMP_REDUCED = 0.22; // amplitude when prefers-reduced-motion

export const EAR_X = 0; // ear sits centered…
export const EAR_Y = 1.16; // …just below the longest bob
const PAN_HALF = 1.45; // x that maps to full L/R pan

// Speed of sound in stage-units/sec. Tuned so a passing bob gives a musical
// vibrato of ~±2 semitones: dopplerFactor = C/(C + v_r), clamped [0.5, 2].
export const SPEED_OF_SOUND = 11;

const TILT_GAIN = 1.0; // how strongly gravity-tilt shifts the swing equilibrium

// Ascending equal-temperament pentatonic run up the row (NOT just intonation,
// no drone bed) — at rest a gentle rising chord; the Doppler adds the shimmer.
const PENT = [0, 2, 4, 7, 9]; // major-pentatonic semitone offsets
const BASE_HZ = 146.83; // D3

function equalTempered(k: number): number {
  const octave = Math.floor(k / PENT.length);
  const semis = octave * 12 + PENT[k % PENT.length];
  return BASE_HZ * Math.pow(2, semis / 12);
}

// ── the field ─────────────────────────────────────────────────────────────────
export interface Bob {
  idx: number;
  pivotX: number; // normalized pivot along the rail, [-0.92, 0.92]
  length: number; // normalized pendulum length
  omega: number; // swing angular frequency (rad/s)
  amp: number; // swing half-angle (rad)
  f0: number; // base pitch (Hz)
  detune: number; // small stable per-bob detune (cents) for warmth
}

export interface Field {
  bobs: Bob[];
  vNorm: number; // reference max radial speed, for glow/cutoff normalization
}

export function createField(reducedMotion: boolean): Field {
  const rand = mulberry32(0x8856);
  const amp = reducedMotion ? AMP_REDUCED : AMP_BASE;
  const bobs: Bob[] = [];
  let vNorm = 0.001;
  for (let k = 0; k < N; k++) {
    const oscCount = BASE_OSC + k;
    const period = TOTAL_CYCLE / oscCount;
    const omega = (2 * Math.PI) / period;
    // Real-pendulum scaling: length ∝ period². Longest = slowest = LEN_MAX.
    const longest = TOTAL_CYCLE / BASE_OSC;
    const length = LEN_MAX * Math.pow(period / longest, 2);
    const pivotX = -0.92 + (1.84 * k) / (N - 1);
    const detune = (rand() - 0.5) * 6; // ±3 cents, stable
    bobs.push({
      idx: k,
      pivotX,
      length,
      omega,
      amp,
      f0: equalTempered(k),
      detune,
    });
    // Peak linear speed of this bob (~L·amp·ω) informs the glow normalization.
    vNorm = Math.max(vNorm, length * amp * omega);
  }
  return { bobs, vNorm };
}

// ── per-frame kinematics ──────────────────────────────────────────────────────
// Classic pendulum-wave release: all bobs start at +amp at t=0 (cosine), so the
// row is in unison at release and fans out afterwards. `tilt` (radians) shifts
// the swing equilibrium — the whole fan leans toward gravity — without changing
// the swing velocity.
export interface Kinematics {
  alpha: number; // arm angle from vertical (rad) — used directly for rendering
  dalpha: number; // angular velocity (rad/s)
}

export function stepBob(bob: Bob, t: number, tilt: number): Kinematics {
  const alpha = tilt * TILT_GAIN + bob.amp * Math.cos(bob.omega * t);
  const dalpha = -bob.amp * bob.omega * Math.sin(bob.omega * t);
  return { alpha, dalpha };
}

// ── Doppler + spatialization (Christian Doppler, 1842) ───────────────────────
export interface Voice {
  freq: number; // Doppler-shifted pitch (Hz)
  panX: number; // stereo pan, [-1, 1]
  gain: number; // gentle distance gain (0..1 shape)
  cutoff: number; // lowpass cutoff (Hz) — brightens on approach
  glow: number; // 0..1, brightens as the bob approaches the ear
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function voiceOf(
  bob: Bob,
  kin: Kinematics,
  vNorm: number,
  speedOfSound: number,
): Voice {
  const sinA = Math.sin(kin.alpha);
  const cosA = Math.cos(kin.alpha);
  // Bob position (pivotY = 0) and velocity.
  const x = bob.pivotX + bob.length * sinA;
  const y = bob.length * cosA;
  const vx = bob.length * cosA * kin.dalpha;
  const vy = -bob.length * sinA * kin.dalpha;
  // Radial velocity toward the ear (positive = receding).
  const rx = x - EAR_X;
  const ry = y - EAR_Y;
  const dist = Math.hypot(rx, ry) || 1e-4;
  const vRad = (vx * rx + vy * ry) / dist;

  const dopplerFactor = clamp(speedOfSound / (speedOfSound + vRad), 0.5, 2);
  const approach = clamp(-vRad / vNorm, 0, 1); // 0 receding … 1 rushing toward ear

  return {
    freq: bob.f0 * dopplerFactor,
    panX: clamp(x / PAN_HALF, -1, 1),
    gain: clamp(0.42 / dist, 0.28, 0.92),
    cutoff: 700 + approach * 2800,
    glow: approach,
  };
}
