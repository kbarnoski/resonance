// arc.ts — Arc state machine for the EDM build-and-drop engine.
//
// The arc is a clock-driven state machine over BARS at a fixed BPM (126).
// Phases (in bars):
//   GROOVE(16)  → BUILD(16, tension 0→1) → DROP(16, tension peak→decay)
//   → RELEASE(16) → loop with new variation seed.
//
// The tension scalar [0,1] is the central "knob":
//   - 0 = groove/rest, max groove energy
//   - ramps to 1.0 at the end of BUILD
//   - snaps to 1.0 on DROP beat 0, then decays over DROP phase
//   - returns to 0 in RELEASE
//
// Each loop randomises: riser waveform, lead motif transposition, fill pattern.

export type ArcPhase = "GROOVE" | "BUILD" | "DROP" | "RELEASE"

export interface ArcState {
  phase: ArcPhase
  bar: number          // bar within this phase (0-based)
  beat: number         // beat within the bar (0-3)
  tension: number      // [0,1]
  barsPerPhase: number
  // Per-loop variation seeds (randomised each loop)
  loopSeed: number     // 0..1 — general variation seed
  motifTranspose: number  // semitones: 0, 2, or 5
  riserType: number    // 0=noise, 1=saw, 2=both
  fillPattern: number  // 0,1,2 — snare-fill variant
  // User steering
  userIntensity: number  // [0,1] — charges the next drop intensity
  dropNow: boolean       // flag: trigger drop early
  // Absolute timing (audio time seconds of phase start)
  phaseStartTime: number
  totalBars: number   // bars elapsed across all phases
}

export const BPM = 126
export const BARS_PER_PHASE = 16
export const BEATS_PER_BAR = 4

export function makeBeatDuration(): number {
  return 60 / BPM
}

export function makeBarDuration(): number {
  return makeBeatDuration() * BEATS_PER_BAR
}

export function makePhaseDuration(): number {
  return makeBarDuration() * BARS_PER_PHASE
}

function newLoopVariation(prev: ArcState, userIntensity: number): Partial<ArcState> {
  const r = Math.random()
  // Intensity bias: user can weight the motif transposition and riser type
  const transpositions = [0, 2, 5, 7] as const
  const ti = Math.floor(r * transpositions.length)
  return {
    loopSeed: Math.random(),
    motifTranspose: transpositions[ti],
    riserType: Math.floor(Math.random() * 3),
    fillPattern: Math.floor(Math.random() * 3),
    userIntensity,
  }
}

export function makeInitialArcState(): ArcState {
  return {
    phase: "GROOVE",
    bar: 0,
    beat: 0,
    tension: 0,
    barsPerPhase: BARS_PER_PHASE,
    loopSeed: Math.random(),
    motifTranspose: 0,
    riserType: 0,
    fillPattern: 0,
    userIntensity: 0,
    dropNow: false,
    phaseStartTime: 0,
    totalBars: 0,
  }
}

// Called by the scheduler each beat to advance the arc state.
// Returns the new ArcState and whether a phase transition occurred.
export function advanceArcBeat(
  prev: ArcState,
  audioTime: number,
  userIntensity: number,
  dropNow: boolean,
): { state: ArcState; phaseChanged: boolean } {
  let { phase, bar, beat, tension, totalBars } = prev
  let phaseChanged = false

  // Advance beat/bar
  beat = (beat + 1) % BEATS_PER_BAR
  if (beat === 0) {
    bar++
    totalBars++
  }

  // Check for early drop trigger
  const shouldDropEarly = dropNow && phase === "BUILD" && bar >= 4

  // Check phase transition
  if (bar >= BARS_PER_PHASE || shouldDropEarly) {
    phaseChanged = true
    bar = 0
    beat = 0

    const nextPhase: Record<ArcPhase, ArcPhase> = {
      GROOVE: "BUILD",
      BUILD: "DROP",
      DROP: "RELEASE",
      RELEASE: "GROOVE",
    }
    phase = nextPhase[phase]
  }

  // Compute tension
  const phaseFrac = (bar + beat / BEATS_PER_BAR) / BARS_PER_PHASE
  switch (phase) {
    case "GROOVE":
      // Low-level groove tension oscillates subtly
      tension = 0.05 + 0.05 * Math.sin(phaseFrac * Math.PI * 2)
      break
    case "BUILD":
      // Ramps 0→1, accelerating in the second half
      tension = Math.pow(phaseFrac, 0.7)
      break
    case "DROP":
      if (bar === 0 && beat === 0) {
        // Impact moment
        tension = 1.0
      } else {
        // Decay from peak: stays high for a while then relaxes
        tension = Math.max(0.1, 1.0 - Math.pow(phaseFrac, 0.5) * 0.9)
      }
      break
    case "RELEASE":
      // Decays to groove level
      tension = Math.max(0, 0.15 * (1 - phaseFrac))
      break
  }

  // On GROOVE start (after RELEASE), pick new variation
  let variation: Partial<ArcState> = {}
  if (phaseChanged && phase === "GROOVE") {
    variation = newLoopVariation(prev, userIntensity)
  }

  const phaseStartTime = phaseChanged ? audioTime : prev.phaseStartTime

  return {
    state: {
      ...prev,
      ...variation,
      phase,
      bar,
      beat,
      tension,
      totalBars,
      dropNow: false,
      userIntensity: phaseChanged ? userIntensity : prev.userIntensity,
      phaseStartTime,
    },
    phaseChanged,
  }
}

// Derive riser filter frequency from tension (BUILD phase).
// During BUILD: sweeps from ~200Hz to ~18kHz as tension goes 0→1.
export function riserCutoff(tension: number): number {
  return 200 * Math.pow(90, tension)
}

// High-pass "suck out" frequency (kicks in near end of BUILD).
// Above 0.8 tension, we sweep a high-pass from 20Hz up to 800Hz.
export function suckoutHP(tension: number): number {
  if (tension < 0.8) return 20
  return 20 + 780 * ((tension - 0.8) / 0.2)
}

// Snare-roll note spacing in beats (halves toward the drop).
// tension 0 → 2 beats spacing; tension 1 → 1/8 beat spacing.
export function snareRollSpacing(tension: number): number {
  return Math.pow(2, 1 - 5 * tension)  // 2 → 0.0625 beats
}

// Bass filter cutoff: tension-driven LP sweep.
// tension 0 → 200Hz (muffled); tension 1 → 8000Hz (fully open).
export function bassCutoff(tension: number, phase: ArcPhase): number {
  if (phase === "GROOVE") return 600
  if (phase === "DROP") return 8000
  if (phase === "RELEASE") return 400 + 400 * (1 - tension)
  // BUILD: sweep
  return 200 + 7800 * tension
}
