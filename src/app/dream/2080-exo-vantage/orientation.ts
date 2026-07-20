/**
 * The visual–vestibular decoupler for 2080 · Exo Vantage.
 *
 * One tilt vector, and one MISMATCH scalar. The tilt is where the phone's inner
 * ear (its motion sensor) says the body is leaning; the mismatch is how far the
 * felt (vestibular) signal has drifted OUT OF REGISTER with what the eyes see —
 * the documented substrate of the out-of-body / depersonalization percept
 * (Cento & Gammeri 2026; Lenggenhager "Video ergo sum" 2007). As mismatch
 * accumulates, the camera detaches from the figure's head and floats out; as you
 * hold still it relaxes back toward embodiment. It BREATHES between the two.
 *
 * Three inputs move the tilt, in priority order:
 *   1. DEVICE — DeviceOrientationEvent beta/gamma. The FIRST reading calibrates a
 *      resting baseline, so however the phone is comfortably held becomes "level".
 *   2. KEYS   — arrow keys nudge a persistent tilt offset (desktop / no sensor).
 *   3. GHOST  — a seeded auto-drift that is always slowly wandering the tilt, so
 *      the whole detachment effect is visible with ZERO sensor and ZERO input.
 *
 * Everything glides — nothing snaps. No Math.random / Date.now anywhere; the
 * ghost is a seeded PRNG advanced by performance.now deltas only.
 */

export type TiltSource = "device" | "keys" | "ghost";

export interface TiltFrame {
  /** Left-right lean, radians (smoothed). Drives figure sway + stereo. */
  tiltX: number;
  /** Front-back lean, radians (smoothed). */
  tiltZ: number;
  /** Detachment / mismatch scalar, 0 (embodied) .. 1 (fully out-of-body). */
  detach: number;
  source: TiltSource;
}

const DEG = Math.PI / 180;
const MAX_TILT_RAD = 1.05; // ~60°
const GHOST_AMP_A = 0.55;
const GHOST_AMP_B = 0.3;

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

export class TiltField {
  private reduced: boolean;

  // Smoothed live tilt (radians) + previous, for angular-speed = mismatch pump.
  private tiltX = 0;
  private tiltZ = 0;
  private prevTiltX = 0;
  private prevTiltZ = 0;

  // Device input (calibrated deltas, radians).
  private devX = 0;
  private devZ = 0;
  private hasDevice = false;
  private calibrated = false;
  private baseBeta = 0;
  private baseGamma = 0;
  private lastDeviceMs = -1e9;

  // Persistent key offset (radians).
  private keyX = 0;
  private keyZ = 0;
  private keyUp = false;
  private keyDown = false;
  private keyLeft = false;
  private keyRight = false;

  // Mismatch: a leaky integrator pumped by tilt angular-speed, plus a slow
  // seeded "breath" so the piece oscillates between embodied and out-of-body.
  private mismatch = 0;
  private detach = 0;

  // Ghost drift phases (seeded, incommensurate rates).
  private pA: number;
  private pB: number;
  private pC: number;
  private pD: number;
  private pBreath: number;
  private readonly fA: number;
  private readonly fB: number;
  private readonly fC: number;
  private readonly fD: number;
  private readonly fBreath: number;

  private lastT = -1;

  constructor(opts?: { reduced?: boolean }) {
    this.reduced = opts?.reduced ?? false;
    const rng = mulberry32(0x2080_ec0e);
    this.pA = rng() * Math.PI * 2;
    this.pB = rng() * Math.PI * 2;
    this.pC = rng() * Math.PI * 2;
    this.pD = rng() * Math.PI * 2;
    this.pBreath = rng() * Math.PI * 2;
    this.fA = 0.041 + rng() * 0.02;
    this.fB = 0.067 + rng() * 0.03;
    this.fC = 0.035 + rng() * 0.02;
    this.fD = 0.083 + rng() * 0.03;
    this.fBreath = 0.021 + rng() * 0.008; // ~40-50s breath cycle
  }

  /** Attach as a `deviceorientation` handler. */
  onDeviceOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta == null && e.gamma == null) return;
    const beta = e.beta ?? 0; // front-back
    const gamma = e.gamma ?? 0; // left-right
    if (!this.calibrated) {
      this.baseBeta = beta;
      this.baseGamma = gamma;
      this.calibrated = true;
    }
    this.hasDevice = true;
    this.lastDeviceMs = performance.now();
    this.devZ = clamp((beta - this.baseBeta) * DEG, -MAX_TILT_RAD, MAX_TILT_RAD);
    this.devX = clamp((gamma - this.baseGamma) * DEG, -MAX_TILT_RAD, MAX_TILT_RAD);
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

  sample(tMs: number): TiltFrame {
    let dt = this.lastT < 0 ? 1 / 60 : (tMs - this.lastT) / 1000;
    dt = clamp(dt, 0, 0.1);
    this.lastT = tMs;

    const deviceActive = this.hasDevice && tMs - this.lastDeviceMs < 1500;

    let targetX: number;
    let targetZ: number;
    let source: TiltSource;

    if (deviceActive) {
      targetX = this.devX;
      targetZ = this.devZ;
      source = "device";
    } else {
      const kh = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
      const kv = (this.keyUp ? 1 : 0) - (this.keyDown ? 1 : 0);
      const anyKey = kh !== 0 || kv !== 0;
      const rate = 0.9 * dt;
      this.keyX = clamp(this.keyX + kh * rate, -MAX_TILT_RAD, MAX_TILT_RAD);
      this.keyZ = clamp(this.keyZ + kv * rate, -MAX_TILT_RAD, MAX_TILT_RAD);

      let ghostX = 0;
      let ghostZ = 0;
      if (!this.reduced) {
        this.pA += this.fA * dt * (Math.PI * 2);
        this.pB += this.fB * dt * (Math.PI * 2);
        this.pC += this.fC * dt * (Math.PI * 2);
        this.pD += this.fD * dt * (Math.PI * 2);
        ghostX = GHOST_AMP_A * Math.sin(this.pA) + GHOST_AMP_B * Math.sin(this.pB);
        ghostZ = GHOST_AMP_A * Math.sin(this.pC) + GHOST_AMP_B * Math.sin(this.pD);
      }

      targetX = clamp(this.keyX + ghostX, -MAX_TILT_RAD, MAX_TILT_RAD);
      targetZ = clamp(this.keyZ + ghostZ, -MAX_TILT_RAD, MAX_TILT_RAD);
      source = anyKey ? "keys" : "ghost";
    }

    // Exponential glide toward target — nothing snaps.
    const follow = 1 - Math.exp(-dt * 2.2);
    this.prevTiltX = this.tiltX;
    this.prevTiltZ = this.tiltZ;
    this.tiltX += (targetX - this.tiltX) * follow;
    this.tiltZ += (targetZ - this.tiltZ) * follow;

    // Angular speed of the felt tilt = how hard the vestibular channel is
    // disagreeing with the (lagging) visual one. It PUMPS the mismatch.
    const speed = dt > 0 ? Math.hypot(this.tiltX - this.prevTiltX, this.tiltZ - this.prevTiltZ) / dt : 0;
    const speedNorm = clamp(speed / 1.4, 0, 1);
    // Leaky integrator: movement raises mismatch, stillness relaxes it SLOWLY.
    this.mismatch += (speedNorm * 2.6 - this.mismatch * 0.45) * dt;
    this.mismatch = clamp(this.mismatch, 0, 1);

    // A slow seeded breath so the piece drifts out and back even at true rest.
    this.pBreath += this.fBreath * dt * (Math.PI * 2);
    const breathAmp = this.reduced ? 0.06 : 0.34;
    const breath = (0.5 + 0.5 * Math.sin(this.pBreath)) * breathAmp;

    const detachTarget = clamp(this.mismatch * 0.82 + breath, 0, 1);
    // Extra-slow, dreamlike ease so the camera never lurches.
    this.detach += (detachTarget - this.detach) * (1 - Math.exp(-dt * 1.1));

    return { tiltX: this.tiltX, tiltZ: this.tiltZ, detach: clamp(this.detach, 0, 1), source };
  }
}
