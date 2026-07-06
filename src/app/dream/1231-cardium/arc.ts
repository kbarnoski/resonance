// arc.ts — the long-form self-organising clock.
//
// Over 5+ minutes an internal clock walks the excitable medium through phases:
//   calm       — single sweeping pulses, paced ~gentle heartbeat, waves annihilate
//   onset      — a reentrant rotor is seeded; a sustained spiral wraps the sphere
//   fibrillation — the tip destabilises into multi-wavelet chaos (dense patter)
//   dissolution — refractoriness lengthens, wavelets collide and die, back to calm
// then it re-seeds with a fresh random orientation so the arc evolves and never
// repeats identically. The ARC of this self-organisation IS the composition.
//
// The controller only decides *targets* (excitation drive, pacing, active voice
// regions) and emits seed/clear events; the medium's own nonlinear dynamics do
// the rest. A gentle conductor bias (from the slider) is blended on top.

export type Phase = "calm" | "onset" | "fibrillation" | "dissolution"

export interface ArcState {
  phase: Phase
  /** 0 (deeply calm, long refractory) .. 1 (fibrillation, short refractory). */
  drive: number
  /** Seconds between auto-paced pulses; 0 disables pacing. */
  paceInterval: number
  /** How many listening regions should sound (1 calm .. 3 fibrillation). */
  activeRegions: number
  /** Elapsed seconds since Begin. */
  elapsed: number
}

interface Event {
  seedRotor?: boolean
  clearField?: boolean
  /** A paced pulse should fire this frame. */
  pace?: boolean
}

// One full cycle of the arc (seconds). Comfortably past the 5-minute minimum
// including the calm run-in.
const CALM_END = 62
const ONSET_END = 150
const FIB_END = 248
const CYCLE_END = 320

export class ArcController {
  private t = 0
  private cycle = 0
  private lastPace = 0
  /** User conductor bias in [-0.5, 0.5], added to the arc drive. */
  userBias = 0

  reset() {
    this.t = 0
    this.cycle = 0
    this.lastPace = 0
  }

  private phaseFor(local: number): Phase {
    if (local < CALM_END) return "calm"
    if (local < ONSET_END) return "onset"
    if (local < FIB_END) return "fibrillation"
    return "dissolution"
  }

  /**
   * Advance the clock by dt seconds. Returns the current targets plus any
   * one-shot events (rotor seeding, field clearing) to apply this frame.
   */
  advance(dt: number): { state: ArcState; event: Event } {
    const prevLocal = this.t % CYCLE_END
    this.t += dt
    const local = this.t % CYCLE_END
    const wrapped = Math.floor(this.t / CYCLE_END) > this.cycle

    const event: Event = {}
    const prevPhase = this.phaseFor(prevLocal)
    const phase = this.phaseFor(local)

    if (wrapped) {
      this.cycle = Math.floor(this.t / CYCLE_END)
      event.clearField = true // fresh quiescent tissue for the new cycle
    }
    // Seed the rotor once, on the calm -> onset transition.
    if (prevPhase === "calm" && phase === "onset") {
      event.seedRotor = true
    }

    // Base drive per phase, smoothly ramped so any luminance change stays slow.
    let baseDrive: number
    let paceInterval: number
    let activeRegions: number
    if (phase === "calm") {
      baseDrive = 0.12
      // pacing slowly quickens through the calm run-in (~2.4s -> ~1.6s)
      paceInterval = 2.4 - 0.8 * (local / CALM_END)
      activeRegions = 1
    } else if (phase === "onset") {
      const f = (local - CALM_END) / (ONSET_END - CALM_END)
      baseDrive = 0.4 + 0.15 * f
      paceInterval = 0 // the rotor self-sustains; stop external pacing
      activeRegions = 2
    } else if (phase === "fibrillation") {
      const f = (local - ONSET_END) / (FIB_END - ONSET_END)
      baseDrive = 0.78 + 0.14 * Math.sin(f * Math.PI) // peak chaos mid-phase
      paceInterval = 0
      activeRegions = 3
    } else {
      const f = (local - FIB_END) / (CYCLE_END - FIB_END)
      baseDrive = 0.55 * (1 - f) // refractoriness lengthens; waves die out
      paceInterval = f > 0.6 ? 3.0 : 0 // gentle heartbeat returns at the very end
      activeRegions = f > 0.6 ? 1 : 2
    }

    const drive = Math.max(0, Math.min(1, baseDrive + this.userBias))

    // Pace timing.
    if (paceInterval > 0 && this.t - this.lastPace >= paceInterval) {
      this.lastPace = this.t
      event.pace = true
    }

    return {
      state: { phase, drive, paceInterval, activeRegions, elapsed: this.t },
      event,
    }
  }
}
