// groove.ts — steady tempo grid + quantizing scheduler for 419-kids-body-band.
//
// Keeps an internal ~100 BPM clock divided into 16th-note slots. Gesture hits
// are QUANTIZED onto the nearest upcoming grid slot so even a flailing toddler
// locks into a beat. A soft always-on hi-hat pulse keeps a groove going even
// when the child is still; motion energy raises the groove's fullness.
//
// Uses the Web Audio look-ahead scheduling pattern (Chris Wilson, "A Tale of
// Two Clocks"): a JS interval peeks ~120ms ahead and schedules drum events at
// precise AudioContext times.

import type { DrumKit, DrumKind } from "./drums";
import { playDrum, playHatTick } from "./drums";

export const BPM = 100;
const SEC_PER_BEAT = 60 / BPM;
export const SEC_PER_STEP = SEC_PER_BEAT / 4; // 16th notes

const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.12; // seconds to schedule into the future

// A hit requested by a gesture, to be quantized onto the grid.
interface PendingHit {
  kind: DrumKind;
  velocity: number;
}

export interface GrooveCallbacks {
  // Fired (at the AudioContext time the drum sounds) so visuals can flash.
  onHit?: (kind: DrumKind, velocity: number, step: number) => void;
}

export class Groove {
  private kit: DrumKit;
  private nextStepTime: number;
  private step = 0; // 0..15 within a bar
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: PendingHit[] = [];
  private cb: GrooveCallbacks;

  // 0..1 — how energetic the body is; raises pulse fullness.
  energy = 0;

  constructor(kit: DrumKit, cb: GrooveCallbacks = {}) {
    this.kit = kit;
    this.cb = cb;
    this.nextStepTime = kit.ctx.currentTime + 0.1;
  }

  start(): void {
    if (this.timer) return;
    this.nextStepTime = this.kit.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Queue a gesture-triggered hit; it lands on the next grid slot.
  trigger(kind: DrumKind, velocity: number): void {
    // Avoid stacking many of the same drum on one slot (a flailing limb can
    // fire repeatedly) — keep only the loudest pending of each kind.
    const existing = this.pending.find((p) => p.kind === kind);
    if (existing) {
      existing.velocity = Math.max(existing.velocity, velocity);
    } else {
      this.pending.push({ kind, velocity });
    }
  }

  private tick(): void {
    const ctx = this.kit.ctx;
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += SEC_PER_STEP;
      this.step = (this.step + 1) % 16;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const kit = this.kit;

    // ── Always-on pulse: a soft hat on every 8th, accented on the beat ─────
    // Fullness grows with energy: at rest only quarter-note ticks; energetic
    // motion fills in 8ths and the occasional 16th.
    const e = this.energy;
    const onBeat = step % 4 === 0;
    const onEighth = step % 2 === 0;

    if (onBeat) {
      playHatTick(kit, time, 0.32 + 0.2 * e, false);
    } else if (onEighth && e > 0.18) {
      playHatTick(kit, time, 0.18 + 0.18 * e, false);
    } else if (e > 0.55 && step % 2 === 1) {
      playHatTick(kit, time, 0.12 + 0.12 * e, false);
    }

    // A gentle backbone kick on beat 1 and snare on beat 3 so there is always
    // a recognizable groove even with no gestures — kept quiet so the child's
    // own hits dominate.
    if (step === 0) {
      playDrum(kit, "kick", time, 0.5 + 0.3 * e);
      this.cb.onHit?.("kick", 0.5, step);
    } else if (step === 8 && e > 0.08) {
      playDrum(kit, "snare", time, 0.35 + 0.3 * e);
      this.cb.onHit?.("snare", 0.4, step);
    }

    // ── Quantized gesture hits land on this slot ───────────────────────────
    if (this.pending.length > 0) {
      const hits = this.pending;
      this.pending = [];
      for (const h of hits) {
        playDrum(kit, h.kind, time, h.velocity);
        this.cb.onHit?.(h.kind, h.velocity, step);
      }
    }
  }
}
