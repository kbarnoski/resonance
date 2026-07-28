// ─────────────────────────────────────────────────────────────────────────────
// physics.ts — the walker's balance (an inverted-pendulum-ish model).
//
//   The walker is a single balance value: a lean angle (radians, 0 = upright)
//   and its angular velocity. Gravity is DESTABILISING — like a broom balanced on
//   a palm, the further he leans the harder gravity pulls him over — and a trickle
//   of noise keeps nudging him off centre. Left alone he topples. He only stays up
//   because every note you play applies a corrective or destabilising impulse:
//
//     • a low-tension note is a steady hand — it pulls the lean back toward centre,
//       bleeds off angular velocity, and advances him along the wire (progress);
//     • a high-tension note is a shove — it adds angular velocity in the note's
//       lateral direction and stalls (or reverses) his progress.
//
//   If |lean| exceeds FALL_LEAN he falls. If progress reaches 1 he's crossed to
//   the far platform and wins. This is deliberately decoupled from rendering so a
//   WebGL-less fallback can still run the same stakes against a 2-D meter.
// ─────────────────────────────────────────────────────────────────────────────

import type { NoteAnalysis } from "./harmony";

const GRAVITY = 7.5; // destabilising torque coefficient (grows with lean)
const DAMPING = 1.0; // passive angular damping (1/s)
const NOISE = 0.9; // constant threat: random torque amplitude
const FALL_LEAN = 0.6; // ~34°: past here he's gone
const MAX_ANGVEL = 6.0;

const CORRECT = 6.5; // corrective pull of a perfect note
const STEADY = 0.6; // how much a perfect note bleeds off angular velocity
const SHOVE = 0.95; // destabilising kick of a maximally dissonant note
const STRIDE = 0.075; // forward progress per well-chosen note
const QUALITY_GATE = 0.55; // note quality (1−tension) must beat this to advance

export interface WalkerState {
  lean: number;
  angVel: number;
  progress: number; // 0 (start platform) … 1 (far platform)
  wobble: number; // smoothed instability ∈ [0,1] for audio/visual
  fallen: boolean;
  won: boolean;
}

export class WalkerBalance {
  lean = 0;
  angVel = 0;
  progress = 0;
  wobble = 0;
  fallen = false;
  won = false;

  reset(): void {
    this.lean = 0;
    this.angVel = 0;
    this.progress = 0;
    this.wobble = 0;
    this.fallen = false;
    this.won = false;
  }

  /** Apply a played note's tension + direction as a balance impulse. */
  applyNote(note: NoteAnalysis): void {
    if (this.fallen || this.won) return;

    const quality = 1 - note.tension; // 1 = perfectly consonant

    // Corrective pull toward centre — strong for consonant notes, ~nil for jarring
    // ones. Good notes also bleed off angular velocity (a steadying hand).
    this.angVel += -this.lean * CORRECT * quality;
    this.angVel += -this.angVel * STEADY * quality;

    // Destabilising shove — scales with tension, aimed by the note's lateral bias
    // plus a little life so it never feels scripted.
    const dir = note.direction + (Math.random() - 0.5) * 0.25;
    this.angVel += dir * note.tension * SHOVE;
    this.lean += dir * note.tension * SHOVE * 0.14;

    // Progress: beat the quality gate to stride forward; dissonance backslides.
    this.progress += (quality - QUALITY_GATE) * STRIDE;
    if (this.progress < 0) this.progress = 0;
    if (this.progress >= 1) {
      this.progress = 1;
      this.won = true;
    }
  }

  /** Advance the balance by dt seconds (gravity + noise + damping). */
  step(dt: number): void {
    if (this.fallen || this.won) {
      // Let residual motion decay for the fall/win animation.
      this.wobble *= Math.max(0, 1 - dt * 1.5);
      return;
    }

    // Inverted-pendulum gravity: torque grows with how far he already leans.
    const gravTorque = GRAVITY * Math.sin(this.lean);
    const noiseTorque = (Math.random() - 0.5) * 2 * NOISE;

    this.angVel += (gravTorque + noiseTorque) * dt;
    this.angVel *= Math.exp(-DAMPING * dt);
    this.angVel = Math.max(-MAX_ANGVEL, Math.min(MAX_ANGVEL, this.angVel));

    this.lean += this.angVel * dt;

    // Smoothed instability for the audible/visible wobble.
    const inst = Math.min(1, Math.abs(this.angVel) * 0.4 + Math.abs(this.lean) * 1.4);
    this.wobble += (inst - this.wobble) * Math.min(1, dt * 8);

    if (Math.abs(this.lean) >= FALL_LEAN) {
      this.fallen = true;
    }
  }

  snapshot(): WalkerState {
    return {
      lean: this.lean,
      angVel: this.angVel,
      progress: this.progress,
      wobble: this.wobble,
      fallen: this.fallen,
      won: this.won,
    };
  }
}

export { FALL_LEAN };
