// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe · the beam
//
// Device orientation is the PRIMARY instrument here. The phone's tilt aims a
// reticle across the celestial sphere the way an astrolabe's alidade is sighted
// on a star. This controller resolves, per frame, a single beam direction
// expressed as (yaw, pitch) — the direction the camera looks, i.e. the point
// the centre-screen reticle rests on.
//
// Input priority while running:
//   1. DEVICE  — DeviceOrientationEvent gamma→yaw, beta→pitch. First event
//                calibrates a resting baseline so whatever pose you hold the
//                phone in becomes "level".
//   2. MOUSE   — desktop fallback: cursor position across the viewport.
//   3. KEYS    — desktop fallback: arrow keys accumulate a heading.
//   4. DEMO    — a seeded auto-sweep target (only when nothing above is live).
//   5. GHOST   — before Start, a gentle idle drift so the sky is alive at load.
//
// Everything is smoothed with an exponential follower — the beam glides, never
// snaps. Timing uses performance.now(); no Math.random / Date.now here.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from "./rng";

const DEG = Math.PI / 180;
const MAX_PITCH = 1.28; // ~73° — clear of the poles
const YAW_FROM_GAMMA = 2.6; // gamma tilt → yaw gain
const PITCH_FROM_BETA = 1.9; // beta tilt → pitch gain

export type BeamSource = "device" | "mouse" | "keys" | "demo" | "ghost";

export interface BeamFrame {
  yaw: number;
  pitch: number;
  source: BeamSource;
  /** Forward unit vector implied by (yaw, pitch). */
  fwd: [number, number, number];
}

export class BeamController {
  private yaw = 0;
  private pitch = 0;

  private running = false;

  // Device
  private hasDevice = false;
  private calibrated = false;
  private baseGamma = 0;
  private baseBeta = 0;
  private devYaw = 0;
  private devPitch = 0;
  private lastDeviceMs = -1e9;

  // Mouse
  private mouseYaw = 0;
  private mousePitch = 0;
  private lastMouseMs = -1e9;

  // Keys (accumulated heading)
  private keyYaw = 0;
  private keyPitch = 0;
  private kUp = false;
  private kDown = false;
  private kLeft = false;
  private kRight = false;

  private lastT = -1;

  setRunning(v: boolean): void {
    this.running = v;
  }

  hasDeviceSensor(): boolean {
    return this.hasDevice;
  }

  /** Drop the resting baseline so the next reading re-levels the sky. */
  recalibrate(): void {
    this.calibrated = false;
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
    this.devYaw = (gamma - this.baseGamma) * DEG * YAW_FROM_GAMMA;
    this.devPitch = clamp(
      (beta - this.baseBeta) * DEG * PITCH_FROM_BETA,
      -MAX_PITCH,
      MAX_PITCH,
    );
  };

  /** nx, ny normalized to -1..1 across the viewport. */
  setMouse(nx: number, ny: number): void {
    this.mouseYaw = nx * Math.PI * 0.9;
    this.mousePitch = clamp(-ny * MAX_PITCH, -MAX_PITCH, MAX_PITCH);
    this.lastMouseMs = performance.now();
  }

  /** Returns true if the key is one we consume. */
  setKey(code: string, down: boolean): boolean {
    switch (code) {
      case "ArrowUp":
        this.kUp = down;
        break;
      case "ArrowDown":
        this.kDown = down;
        break;
      case "ArrowLeft":
        this.kLeft = down;
        break;
      case "ArrowRight":
        this.kRight = down;
        break;
      default:
        return false;
    }
    return true;
  }

  private static forward(yaw: number, pitch: number): [number, number, number] {
    const cp = Math.cos(pitch);
    return [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  }

  /**
   * Resolve the beam for this frame.
   * @param tMs        performance.now()
   * @param demoTarget optional {yaw,pitch} the seeded auto-demo wants to reach
   */
  sample(
    tMs: number,
    demoTarget: { yaw: number; pitch: number } | null,
  ): BeamFrame {
    let dt = this.lastT < 0 ? 1 / 60 : (tMs - this.lastT) / 1000;
    dt = clamp(dt, 0, 0.1);
    this.lastT = tMs;

    const deviceLive = this.hasDevice && tMs - this.lastDeviceMs < 1200;
    const mouseLive = tMs - this.lastMouseMs < 1200;
    const anyKey = this.kUp || this.kDown || this.kLeft || this.kRight;

    let targetYaw: number;
    let targetPitch: number;
    let source: BeamSource;

    if (!this.running) {
      // Idle ambience before Start — a slow ghost drift.
      const s = tMs / 1000;
      targetYaw = Math.sin(s * 0.11) * 1.4 + Math.sin(s * 0.047) * 0.6;
      targetPitch = Math.sin(s * 0.083) * 0.5;
      source = "ghost";
    } else if (deviceLive) {
      targetYaw = this.devYaw;
      targetPitch = this.devPitch;
      source = "device";
    } else if (mouseLive) {
      targetYaw = this.mouseYaw;
      targetPitch = this.mousePitch;
      source = "mouse";
    } else if (anyKey) {
      const kh = (this.kRight ? 1 : 0) - (this.kLeft ? 1 : 0);
      const kv = (this.kUp ? 1 : 0) - (this.kDown ? 1 : 0);
      this.keyYaw += kh * 1.4 * dt;
      this.keyPitch = clamp(this.keyPitch + kv * 1.1 * dt, -MAX_PITCH, MAX_PITCH);
      targetYaw = this.keyYaw;
      targetPitch = this.keyPitch;
      source = "keys";
    } else if (demoTarget) {
      targetYaw = demoTarget.yaw;
      targetPitch = demoTarget.pitch;
      source = "demo";
    } else {
      targetYaw = this.yaw;
      targetPitch = this.pitch;
      source = "demo";
    }

    // Shortest-path yaw wrap so the glide never spins the long way round.
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;

    const follow = 1 - Math.exp(-dt * (source === "demo" ? 2.1 : 3.4));
    this.yaw += dy * follow;
    this.pitch += (targetPitch - this.pitch) * follow;
    this.pitch = clamp(this.pitch, -MAX_PITCH, MAX_PITCH);

    return {
      yaw: this.yaw,
      pitch: this.pitch,
      source,
      fwd: BeamController.forward(this.yaw, this.pitch),
    };
  }
}
