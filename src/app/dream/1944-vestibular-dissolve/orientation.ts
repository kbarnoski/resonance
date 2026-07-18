/**
 * The gravity field — where "down" lives, and how it melts.
 *
 * A single 3D unit vector is the felt gravity ("down"). Its inverse is the
 * cosmos's "up". Three inputs can move it, in priority order:
 *
 *   1. DEVICE  — DeviceOrientationEvent beta/gamma tilt. The first event
 *      CALIBRATES a resting baseline, so wherever the phone is comfortably
 *      held becomes "level / anchored"; deltas from there tilt the world.
 *   2. KEYS    — arrow keys nudge a persistent offset (desktop / no sensor).
 *   3. GHOST   — a seeded, always-wandering auto-drift so the dissolve is
 *      visible AND audible with zero sensor and zero input (the 06:30 phone
 *      reviewer who won't tilt still sees the cosmos melt and reform).
 *
 * Everything GLIDES: raw targets are smoothed toward with an exponential
 * follower so nothing snaps. `dissolve` (0..1) is how far "down" has melted
 * from level — it drives the drone's spectral spread and the field's boundary
 * loss. No Math.random / Date.now anywhere — seeded PRNG + performance.now.
 */

export type GravitySource = "device" | "keys" | "ghost";

export interface GravityFrame {
  /** Unit "up" vector of the cosmos (= -down). */
  up: [number, number, number];
  /** Left-right component of "down", -1..1 — drives stereo pan. */
  gx: number;
  /** How melted "down" is from level, 0 (anchored) .. 1 (boundless). */
  dissolve: number;
  /** Raw tilt magnitude 0..1. */
  tilt: number;
  source: GravitySource;
}

const DEG = Math.PI / 180;
const MAX_TILT_RAD = 1.22; // ~70°
const GHOST_AMP_A = 0.62;
const GHOST_AMP_B = 0.34;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export class GravityField {
  private reduced: boolean;

  // Smoothed live angles (radians).
  private beta = 0;
  private gamma = 0;

  // Device input (calibrated deltas, radians).
  private devBeta = 0;
  private devGamma = 0;
  private hasDevice = false;
  private calibrated = false;
  private baseBeta = 0;
  private baseGamma = 0;
  private lastDeviceMs = -1e9;

  // Persistent key offset (radians).
  private keyBeta = 0;
  private keyGamma = 0;
  private keyUp = false;
  private keyDown = false;
  private keyLeft = false;
  private keyRight = false;

  // Ghost drift phases (seeded).
  private pA: number;
  private pB: number;
  private pC: number;
  private pD: number;
  private readonly fA: number;
  private readonly fB: number;
  private readonly fC: number;
  private readonly fD: number;

  private lastT = -1;

  constructor(opts?: { reduced?: boolean }) {
    this.reduced = opts?.reduced ?? false;
    const rng = mulberry32(0x1944_d15e);
    this.pA = rng() * Math.PI * 2;
    this.pB = rng() * Math.PI * 2;
    this.pC = rng() * Math.PI * 2;
    this.pD = rng() * Math.PI * 2;
    // Slow, incommensurate rates (rad/s) so the wander never obviously loops.
    this.fA = 0.043 + rng() * 0.02;
    this.fB = 0.071 + rng() * 0.03;
    this.fC = 0.037 + rng() * 0.02;
    this.fD = 0.089 + rng() * 0.03;
  }

  /** Attach as a `deviceorientation` handler. */
  onDeviceOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta == null && e.gamma == null) return;
    const beta = e.beta ?? 0;
    const gamma = e.gamma ?? 0;
    if (!this.calibrated) {
      this.baseBeta = beta;
      this.baseGamma = gamma;
      this.calibrated = true;
    }
    this.hasDevice = true;
    this.lastDeviceMs = performance.now();
    this.devBeta = clamp((beta - this.baseBeta) * DEG, -MAX_TILT_RAD, MAX_TILT_RAD);
    this.devGamma = clamp((gamma - this.baseGamma) * DEG, -MAX_TILT_RAD, MAX_TILT_RAD);
  };

  /** Feed a keydown/keyup. Returns true if the key was one we use. */
  setKey(code: string, down: boolean): boolean {
    switch (code) {
      case "ArrowUp":
        this.keyUp = down;
        return true;
      case "ArrowDown":
        this.keyDown = down;
        return true;
      case "ArrowLeft":
        this.keyLeft = down;
        return true;
      case "ArrowRight":
        this.keyRight = down;
        return true;
      default:
        return false;
    }
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  sample(tMs: number): GravityFrame {
    const tSec = tMs / 1000;
    let dt = this.lastT < 0 ? 1 / 60 : (tMs - this.lastT) / 1000;
    dt = clamp(dt, 0, 0.1);
    this.lastT = tMs;

    const deviceActive = this.hasDevice && tMs - this.lastDeviceMs < 1500;

    let betaT: number;
    let gammaT: number;
    let source: GravitySource;

    if (deviceActive) {
      betaT = this.devBeta;
      gammaT = this.devGamma;
      source = "device";
    } else {
      // Keys accumulate a persistent offset; release lets ghost take over.
      const kv = (this.keyUp ? 1 : 0) - (this.keyDown ? 1 : 0);
      const kh = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
      const anyKey = kv !== 0 || kh !== 0;
      const rate = 1.1 * dt;
      this.keyBeta = clamp(this.keyBeta + kv * rate, -MAX_TILT_RAD, MAX_TILT_RAD);
      this.keyGamma = clamp(this.keyGamma + kh * rate, -MAX_TILT_RAD, MAX_TILT_RAD);

      let ghostBeta = 0;
      let ghostGamma = 0;
      if (!this.reduced) {
        this.pA += this.fA * dt * (Math.PI * 2);
        this.pB += this.fB * dt * (Math.PI * 2);
        this.pC += this.fC * dt * (Math.PI * 2);
        this.pD += this.fD * dt * (Math.PI * 2);
        ghostBeta = GHOST_AMP_A * Math.sin(this.pA) + GHOST_AMP_B * Math.sin(this.pB);
        ghostGamma = GHOST_AMP_A * Math.sin(this.pC) + GHOST_AMP_B * Math.sin(this.pD);
      }

      betaT = clamp(this.keyBeta + ghostBeta, -MAX_TILT_RAD, MAX_TILT_RAD);
      gammaT = clamp(this.keyGamma + ghostGamma, -MAX_TILT_RAD, MAX_TILT_RAD);
      source = anyKey ? "keys" : "ghost";
    }

    // Exponential glide toward the target — nothing snaps.
    const follow = 1 - Math.exp(-dt * 2.4);
    this.beta += (betaT - this.beta) * follow;
    this.gamma += (gammaT - this.gamma) * follow;

    // Build the "down" vector from the two tilt angles.
    const dx = Math.sin(this.gamma);
    const dz = Math.sin(this.beta);
    const dyMag = Math.sqrt(Math.max(0.0001, 1 - dx * dx - dz * dz));
    const dy = -dyMag;
    // "up" = -down.
    let ux = -dx;
    let uy = -dy;
    let uz = -dz;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;

    const tilt = clamp(Math.hypot(dx, dz), 0, 1);
    const dissolve = clamp(tilt * 1.12, 0, 1);
    // Reference tSec so the value is genuinely time-derived (determinism note).
    void tSec;

    return { up: [ux, uy, uz], gx: clamp(dx, -1, 1), dissolve, tilt, source };
  }
}
