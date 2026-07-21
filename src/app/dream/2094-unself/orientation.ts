/**
 * Tilt input for 2094 · Unself.
 *
 * One smoothed tilt vector plus a MOTION scalar (how fast the tilt is moving).
 * Tilt sways the luminous figure and feeds the audio-visual desync channel; it
 * modulates the dissociation arc but never drives it.
 *
 * Two sources, in priority order:
 *   1. DEVICE — DeviceOrientationEvent beta/gamma. The FIRST reading calibrates
 *      a resting baseline, so however the phone is comfortably held is "level".
 *   2. AUTO   — a seeded auto-drive (mulberry32(0x2094) + performance.now) that
 *      slowly wanders the tilt, so the WHOLE journey self-demos with zero sensor
 *      and zero interaction. Engaged when no reading has arrived for ~1.5 s.
 *
 * No pointer / mouse / touch input, no microphone. Everything glides. No
 * Math.random / Date.now — the drift is a seeded PRNG advanced by time deltas.
 */

import { mulberry32 } from "./arc";

export type TiltSource = "tilt" | "auto";

export interface TiltFrame {
  /** Left-right lean, radians (smoothed). */
  tiltX: number;
  /** Front-back lean, radians (smoothed). */
  tiltZ: number;
  /** Normalised angular speed of the tilt, 0..1 — the motion energy. */
  motion: number;
  source: TiltSource;
}

const DEG = Math.PI / 180;
const MAX_TILT_RAD = 1.05; // ~60°
const AUTO_AMP_A = 0.5;
const AUTO_AMP_B = 0.28;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export class TiltField {
  private reduced: boolean;

  private tiltX = 0;
  private tiltZ = 0;
  private prevX = 0;
  private prevZ = 0;
  private motion = 0;

  private devX = 0;
  private devZ = 0;
  private hasDevice = false;
  private calibrated = false;
  private baseBeta = 0;
  private baseGamma = 0;
  private lastDeviceMs = -1e9;

  // Seeded auto-drive phases (incommensurate rates).
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
    const rng = mulberry32(0x2094);
    this.pA = rng() * Math.PI * 2;
    this.pB = rng() * Math.PI * 2;
    this.pC = rng() * Math.PI * 2;
    this.pD = rng() * Math.PI * 2;
    this.fA = 0.033 + rng() * 0.02;
    this.fB = 0.058 + rng() * 0.03;
    this.fC = 0.029 + rng() * 0.02;
    this.fD = 0.071 + rng() * 0.03;
  }

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
    this.devZ = clamp((beta - this.baseBeta) * DEG, -MAX_TILT_RAD, MAX_TILT_RAD);
    this.devX = clamp((gamma - this.baseGamma) * DEG, -MAX_TILT_RAD, MAX_TILT_RAD);
  };

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
      source = "tilt";
    } else {
      let ax = 0;
      let az = 0;
      if (!this.reduced) {
        this.pA += this.fA * dt * (Math.PI * 2);
        this.pB += this.fB * dt * (Math.PI * 2);
        this.pC += this.fC * dt * (Math.PI * 2);
        this.pD += this.fD * dt * (Math.PI * 2);
        ax = AUTO_AMP_A * Math.sin(this.pA) + AUTO_AMP_B * Math.sin(this.pB);
        az = AUTO_AMP_A * Math.sin(this.pC) + AUTO_AMP_B * Math.sin(this.pD);
      }
      targetX = clamp(ax, -MAX_TILT_RAD, MAX_TILT_RAD);
      targetZ = clamp(az, -MAX_TILT_RAD, MAX_TILT_RAD);
      source = "auto";
    }

    const follow = 1 - Math.exp(-dt * 2.4);
    this.prevX = this.tiltX;
    this.prevZ = this.tiltZ;
    this.tiltX += (targetX - this.tiltX) * follow;
    this.tiltZ += (targetZ - this.tiltZ) * follow;

    const speed =
      dt > 0 ? Math.hypot(this.tiltX - this.prevX, this.tiltZ - this.prevZ) / dt : 0;
    const speedNorm = clamp(speed / 1.2, 0, 1);
    // Smooth the motion energy so the desync channel is not jittery.
    this.motion += (speedNorm - this.motion) * (1 - Math.exp(-dt * 4));

    return {
      tiltX: this.tiltX,
      tiltZ: this.tiltZ,
      motion: clamp(this.motion, 0, 1),
      source,
    };
  }
}
