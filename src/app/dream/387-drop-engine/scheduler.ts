/**
 * scheduler.ts — Look-ahead beat scheduler for 387-drop-engine
 *
 * Uses a setInterval loop reading audioCtx.currentTime and scheduling
 * notes ~100ms ahead of playback (the standard Web Audio look-ahead trick).
 * This decouples note scheduling from the rAF animation loop for tight timing.
 *
 * The scheduler fires scheduled callbacks for:
 *   - Kick (beat 0 of every bar in most phases)
 *   - Snare/clap (beat 2, plus rolls during BUILD)
 *   - Hi-hat (every beat / every 8th)
 *   - Bass note (beats 1 and 3 — off-beat)
 *   - Lead motif note (phase-dependent)
 *   - Riser update (continuous during BUILD)
 *   - DROP impact (first beat of DROP)
 */

import {
  BARS_PER_PHASE,
  makeBeatDuration,
  snareRollSpacing,
  advanceArcBeat,
  makeInitialArcState,
  type ArcState,
  type ArcPhase,
} from "./arc"
import type { SynthEngine } from "./synth"

export interface SchedulerCallbacks {
  onBeatAdvance: (state: ArcState, prevPhase: ArcPhase) => void
}

const LOOK_AHEAD = 0.12      // seconds ahead to schedule
const INTERVAL_MS = 25       // scheduler poll interval

export class BeatScheduler {
  private synth: SynthEngine
  private callbacks: SchedulerCallbacks

  private state: ArcState
  private nextBeatTime: number   // audio time of the next beat
  private intervalId: ReturnType<typeof setInterval> | null = null

  // Per-phase state
  private motifStep = 0
  private bassRootIdx = 0
  private snareRollQueue: number[] = []  // scheduled times for snare roll notes

  // User steering inputs (written from UI, read by scheduler)
  userIntensity = 0
  dropNow = false

  constructor(synth: SynthEngine, callbacks: SchedulerCallbacks) {
    this.synth = synth
    this.callbacks = callbacks
    this.state = makeInitialArcState()
    this.nextBeatTime = synth.currentTime + 0.05
  }

  start(): void {
    this.nextBeatTime = this.synth.currentTime + 0.05
    this.intervalId = setInterval(() => this.tick(), INTERVAL_MS)
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  getState(): ArcState {
    return this.state
  }

  // ── Scheduler tick ────────────────────────────────────────────────────────

  private tick(): void {
    const now = this.synth.currentTime
    const horizon = now + LOOK_AHEAD

    while (this.nextBeatTime < horizon) {
      this.scheduleOneBeat(this.nextBeatTime)
      this.nextBeatTime += makeBeatDuration()
    }
  }

  private scheduleOneBeat(t: number): void {
    const { state: prev } = { state: this.state }
    const prevPhase = prev.phase

    // Advance arc state
    const { state, phaseChanged } = advanceArcBeat(
      prev,
      t,
      this.userIntensity,
      this.dropNow,
    )
    this.state = state
    if (this.dropNow) this.dropNow = false

    const { phase, beat, bar, tension } = state
    const intensity = 0.7 + state.userIntensity * 0.3

    // Phase entry actions
    if (phaseChanged) {
      this.onPhaseEnter(phase, prevPhase, t, tension, intensity, state)
    }

    // ── Per-beat scheduling ───────────────────────────────────────────────

    switch (phase) {
      case "GROOVE":
        this.scheduleGrooveBeat(t, beat, bar, intensity)
        break
      case "BUILD":
        this.scheduleBuildBeat(t, beat, bar, tension, intensity, state)
        break
      case "DROP":
        this.scheduleDropBeat(t, beat, bar, tension, intensity, state)
        break
      case "RELEASE":
        this.scheduleReleaseBeat(t, beat, bar, tension, intensity)
        break
    }

    // Notify visual layer
    this.callbacks.onBeatAdvance(state, prevPhase)
  }

  // ── Phase entry ───────────────────────────────────────────────────────────

  private onPhaseEnter(
    phase: ArcPhase,
    prevPhase: ArcPhase,
    t: number,
    tension: number,
    intensity: number,
    state: ArcState,
  ): void {
    switch (phase) {
      case "BUILD":
        this.motifStep = 0
        this.synth.startRiser(tension, state.riserType)
        break
      case "DROP":
        this.synth.stopRiser()
        this.synth.scheduleImpact(t, intensity)
        break
      case "RELEASE":
        this.motifStep = 0
        this.bassRootIdx = (this.bassRootIdx + 1) % 4
        break
      case "GROOVE":
        this.motifStep = 0
        this.bassRootIdx = (this.bassRootIdx + 2) % 4
        break
    }
    void prevPhase
  }

  // ── GROOVE beat ───────────────────────────────────────────────────────────

  private scheduleGrooveBeat(t: number, beat: number, bar: number, intensity: number): void {
    const beatDur = makeBeatDuration()

    // Four-on-the-floor kick
    this.synth.scheduleKick(t, intensity * 0.85)

    // Snare on beats 2 and 4 (indices 1 and 3)
    if (beat === 1 || beat === 3) {
      this.synth.scheduleSnare(t, intensity * 0.8)
    }

    // Hi-hat: closed 8ths
    this.synth.scheduleHat(t, false, 0.3)
    this.synth.scheduleHat(t + beatDur * 0.5, false, 0.22)

    // Bass on off-beats (beat 1 and 3 → half-beat offset)
    if (beat === 0 || beat === 2) {
      this.synth.scheduleBassNote(t + beatDur * 0.5, this.bassRootIdx, "GROOVE", 0.05)
    }

    // Lead motif: one note every 2 beats on bars 0,2,4...
    if (beat === 0 && bar % 2 === 0) {
      this.synth.scheduleMotifNote(t, this.motifStep, 0, 0.45)
      this.motifStep++
    }
  }

  // ── BUILD beat ────────────────────────────────────────────────────────────

  private scheduleBuildBeat(
    t: number,
    beat: number,
    bar: number,
    tension: number,
    intensity: number,
    state: ArcState,
  ): void {
    const beatDur = makeBeatDuration()

    // Update riser parameters
    this.synth.updateRiser(tension)

    // Four-on-the-floor (gets more aggressive)
    this.synth.scheduleKick(t, intensity * (0.8 + tension * 0.2))

    // Snare/clap
    if (beat === 1 || beat === 3) {
      this.synth.scheduleSnare(t, intensity * (0.75 + tension * 0.25))
    }

    // Snare roll: accelerating fills in last 4 bars of BUILD
    if (bar >= BARS_PER_PHASE - 4) {
      const rollTension = Math.min(1, tension * 1.2)
      const spacing = snareRollSpacing(rollTension) * beatDur
      const rollCount = Math.ceil(beatDur / spacing)
      for (let i = 1; i < rollCount; i++) {
        const rt = t + i * spacing
        this.synth.scheduleSnare(rt, intensity * 0.4 * (i / rollCount), true)
      }
    }

    // Hi-hat: 8ths escalating to 16ths
    const hatDiv = tension > 0.6 ? 4 : 2
    for (let i = 0; i < hatDiv; i++) {
      this.synth.scheduleHat(t + beatDur * (i / hatDiv), false, 0.25 + tension * 0.2)
    }

    // Open hat on offbeat as tension builds
    if (tension > 0.4 && (beat === 1 || beat === 3)) {
      this.synth.scheduleHat(t, true, 0.35)
    }

    // Bass: more active
    if (beat % 2 === 0) {
      this.synth.scheduleBassNote(t + beatDur * 0.25, this.bassRootIdx, "BUILD", tension)
    }

    // Lead motif more frequent
    const leadEvery = tension > 0.7 ? 1 : 2
    if (beat % leadEvery === 0) {
      this.synth.scheduleMotifNote(t, this.motifStep, state.motifTranspose, 0.5 + tension * 0.3)
      this.motifStep++
    }
  }

  // ── DROP beat ─────────────────────────────────────────────────────────────

  private scheduleDropBeat(
    t: number,
    beat: number,
    bar: number,
    tension: number,
    intensity: number,
    state: ArcState,
  ): void {
    const beatDur = makeBeatDuration()

    // Skip beat 0 of bar 0 — already handled by scheduleImpact
    if (bar === 0 && beat === 0) return

    // Hard kick + snare every beat for first 8 bars
    if (bar < 8) {
      this.synth.scheduleKick(t, intensity)
      if (beat === 1 || beat === 3) {
        this.synth.scheduleSnare(t, intensity)
      }
    } else {
      // Second half: kick on 1 and 3
      if (beat === 0 || beat === 2) {
        this.synth.scheduleKick(t, intensity * 0.9)
      }
      if (beat === 1 || beat === 3) {
        this.synth.scheduleSnare(t, intensity * 0.85)
      }
    }

    // Hi-hat 8ths
    this.synth.scheduleHat(t, false, 0.4)
    this.synth.scheduleHat(t + beatDur * 0.5, beat % 2 === 1, 0.3)

    // Bass: driving
    this.synth.scheduleBassNote(t, this.bassRootIdx, "DROP", tension)

    // Lead: heavy motif on every beat
    if (beat === 0 || beat === 2) {
      this.synth.scheduleMotifNote(t, this.motifStep, state.motifTranspose, intensity)
      this.motifStep++
    }
    if (beat === 1 || beat === 3) {
      this.synth.scheduleMotifNote(t + beatDur * 0.5, this.motifStep, state.motifTranspose + 2, 0.6 * intensity)
      this.motifStep++
    }
  }

  // ── RELEASE beat ──────────────────────────────────────────────────────────

  private scheduleReleaseBeat(
    t: number,
    beat: number,
    bar: number,
    tension: number,
    intensity: number,
  ): void {
    const beatDur = makeBeatDuration()

    // Sparse: kick only on beat 0
    if (beat === 0) {
      this.synth.scheduleKick(t, intensity * 0.65)
    }

    // Light snare on 2
    if (beat === 2) {
      this.synth.scheduleSnare(t, intensity * 0.5)
    }

    // Gentle hi-hat
    if (beat === 0 || beat === 2) {
      this.synth.scheduleHat(t + beatDur * 0.5, false, 0.18)
    }

    // Fading bass
    if (beat === 1) {
      this.synth.scheduleBassNote(t, this.bassRootIdx, "RELEASE", tension)
    }

    // Atmospheric lead stab every 4 bars
    if (bar % 4 === 0 && beat === 0) {
      this.synth.scheduleMotifNote(t, this.motifStep, 0, 0.3)
      this.motifStep++
    }
  }
}
