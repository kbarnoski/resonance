/**
 * entrain.ts — Kuramoto-style single-pair phase coupling for cradle-song.
 *
 * MODEL
 * ─────
 * Two oscillators: the detected ROCK phase (θ_rock) and the MUSIC phase (θ_music).
 *
 *   dθ_music/dt = ω(t) + K · sin(θ_rock − θ_music)
 *
 * where:
 *   • ω(t)  is the music's NATURAL angular frequency, which slowly DRIFTS
 *             downward over the session (the "leading" toward sleep tempo).
 *   • K      is the coupling strength. K > 0 means the music phase is pulled
 *             toward the rock phase (entrainment). This is a genuine
 *             Kuramoto coupled-oscillator model, not a linear error-correction
 *             or PLL — the sin(·) nonlinearity is what makes it Kuramoto.
 *   • θ_rock is estimated from the device-tilt gravity vector (or pointer drag).
 *
 * DOWNWARD LEAD
 * ─────────────
 * ω starts at OMEGA_WAKE (cycles near the child's natural rocking cadence,
 * ~65 cycles/min = 1.08 Hz) and drifts linearly toward OMEGA_SLEEP
 * (~45 cycles/min = 0.75 Hz) over SESSION_S seconds. Once the music leads
 * at a slower tempo, the coupled rock naturally follows — bidirectional entrainment.
 *
 * REFERENCES
 * ──────────
 * Yoshiki Kuramoto (1975), "Self-entrainment of a population of coupled
 *   non-linear oscillators," Lecture Notes in Physics, vol 39.
 * B. Moens, M. Leman et al. (2014), "D-Jogger: synchronizing music with
 *   the running pace," Proc. SMPC.
 * M. Hove et al., "Interactive rhythmic auditory stimulation reinvigorates
 *   motor planning in Parkinson's disease," PLOS ONE, 2012.
 * B. Repp (2005), "Sensorimotor synchronization: a review," Psychon. Bull. Rev.
 */

/** Radians per second at "awake" rocking pace (~65 cpm). */
const OMEGA_WAKE = (2 * Math.PI * 65) / 60; // ≈ 6.81 rad/s

/** Radians per second at "sleep" rocking pace (~45 cpm). */
const OMEGA_SLEEP = (2 * Math.PI * 45) / 60; // ≈ 4.71 rad/s

/** Coupling strength K. Large enough to lock within ~3–4 rocks but
 *  small enough that the music doesn't slavishly chase the child — it
 *  gently invites, not commands.
 */
const K = 2.2;

/** Session length over which the natural frequency drifts down (seconds). */
export const SESSION_S = 720; // 12 minutes

/** How long to fade out at the end (seconds). */
export const FADE_S = 15;

// ─── Rock-phase detector ───────────────────────────────────────────────────
//
// The gravity vector's lateral component (x-axis tilt = beta/gamma) oscillates
// as the tablet rocks. We track zero-crossings on the SMOOTHED signal to
// estimate the current rock PERIOD (and hence instantaneous phase via linear
// interpolation between crossings).

const SMOOTH_ALPHA = 0.12; // EMA smoothing for the gravity signal

export interface RockDetectorState {
  smoothed: number;    // EMA of the raw tilt signal
  lastCrossTime: number; // performance.now() at last upward zero-crossing
  period: number;      // estimated rock period in seconds
  phase: number;       // current estimated phase 0..2π
}

export function makeRockDetector(): RockDetectorState {
  return {
    smoothed: 0,
    lastCrossTime: -1,
    period: (2 * Math.PI) / OMEGA_WAKE, // initial guess
    phase: 0,
  };
}

/**
 * Feed a new raw tilt value (positive = right, negative = left).
 * `now` is performance.now() / 1000 (seconds).
 * Returns the updated estimated rock phase (0..2π).
 */
export function updateRockDetector(
  state: RockDetectorState,
  rawTilt: number,
  nowSec: number,
): number {
  const prev = state.smoothed;
  state.smoothed = state.smoothed * (1 - SMOOTH_ALPHA) + rawTilt * SMOOTH_ALPHA;

  // Detect upward zero-crossing (right-going)
  if (prev < 0 && state.smoothed >= 0) {
    if (state.lastCrossTime >= 0) {
      const elapsed = nowSec - state.lastCrossTime;
      // Sanity-clamp: accept periods between 0.4 s and 4 s
      if (elapsed > 0.4 && elapsed < 4.0) {
        // Gentle IIR on the period estimate so one anomalous rock doesn't jump
        state.period = state.period * 0.7 + elapsed * 0.3;
      }
    }
    state.lastCrossTime = nowSec;
  }

  // Estimate instantaneous phase via linear interpolation since last crossing
  if (state.lastCrossTime >= 0) {
    const sinceCross = nowSec - state.lastCrossTime;
    state.phase = ((sinceCross / state.period) * 2 * Math.PI) % (2 * Math.PI);
  }

  return state.phase;
}

// ─── Music oscillator state ────────────────────────────────────────────────

export interface MusicOscState {
  phase: number;      // θ_music (radians, 0..2π)
  omega: number;      // current natural frequency (rad/s)
  sessionStart: number; // performance.now() when session started (seconds)
}

export function makeMusicOsc(nowSec: number): MusicOscState {
  return {
    phase: 0,
    omega: OMEGA_WAKE,
    sessionStart: nowSec,
  };
}

/**
 * Step the music oscillator forward by `dt` seconds.
 * `rockPhase` is the current detected rock phase (0..2π).
 * Returns the updated music phase.
 *
 * The key equation:  dθ_music/dt = ω(t) + K · sin(θ_rock − θ_music)
 */
export function stepMusicOsc(
  state: MusicOscState,
  rockPhase: number,
  dt: number,
  nowSec: number,
): number {
  // 1. Drift ω downward over the session
  const elapsed = nowSec - state.sessionStart;
  const t = Math.min(1, elapsed / SESSION_S);
  state.omega = OMEGA_WAKE + (OMEGA_SLEEP - OMEGA_WAKE) * t;

  // 2. Kuramoto coupling: pull music phase toward rock phase
  const phaseDiff = rockPhase - state.phase;
  const dTheta = state.omega + K * Math.sin(phaseDiff);

  // 3. Euler integrate
  state.phase = (state.phase + dTheta * dt) % (2 * Math.PI);
  if (state.phase < 0) state.phase += 2 * Math.PI;

  return state.phase;
}

/**
 * Returns the current music tempo in cycles-per-minute for display/audio use.
 */
export function musicCpm(state: MusicOscState): number {
  return (state.omega / (2 * Math.PI)) * 60;
}

/**
 * Returns a normalised "breath" value (0..1) — peaks at the top of each cycle.
 * The audio layer maps this to amplitude envelope.
 */
export function breathValue(phase: number): number {
  // Soft cosine so the peaks are rounded, not harsh
  return (1 - Math.cos(phase)) / 2;
}

/**
 * Returns master gain scalar for end-of-session fade (1 → 0 over FADE_S seconds
 * after SESSION_S).
 */
export function sessionGain(state: MusicOscState, nowSec: number): number {
  const elapsed = nowSec - state.sessionStart;
  if (elapsed <= SESSION_S) return 1;
  const fadeT = (elapsed - SESSION_S) / FADE_S;
  return Math.max(0, 1 - fadeT);
}
