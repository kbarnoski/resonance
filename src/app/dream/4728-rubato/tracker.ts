// ════════════════════════════════════════════════════════════════════════════
// 4728 — rubato · attending oscillator (beat tracker)
//
// A hand-rolled nonlinear ATTENDING OSCILLATOR after Large & Jones (1999),
// "The Dynamics of Attending: How People Track Time-Varying Events"
// (Psychological Review 106(1)). NOT audio spectrum, NOT FFT, NOT a learned
// model, NO score. It infers the player's felt beat purely from the *timing*
// of key/tap onsets and follows free rubato.
//
// State: an internal oscillator with continuous phase φ (0..1, φ=0 is a beat)
// and period p (seconds/beat). On each onset it applies:
//   • period coupling — a GATED pull of p toward the observed inter-onset
//     interval (von-Mises-style focus gate: strong near an expected beat,
//     weak off-beat, so it is stable yet responsive), and
//   • phase reset — the beat grid (`anchor`) is nudged onto the onset,
// so the ensemble speeds up when you rush and stretches when you hold.
// ════════════════════════════════════════════════════════════════════════════

export interface AttendingOsc {
  /** Seconds per beat (the felt tempo). */
  period: number;
  /** Absolute time (s) of a beat instant — the phase==0 reference. */
  anchor: number;
  /** Period-coupling gain (how fast tempo follows the inter-onset interval). */
  etaPeriod: number;
  /** Phase-coupling gain (how strongly the beat grid resets onto an onset). */
  etaPhase: number;
  /** Gate width: larger = follows bigger tempo jumps but jitterier. */
  gateSigma: number;
  /** Smoothed alignment quality [0,1]: high == confidently locked. */
  coherence: number;
  /** Time (s) of the previous onset, or -1 before the first. */
  lastOnset: number;
  /** Count of onsets registered so far (drives bootstrap). */
  onsetCount: number;
  minPeriod: number;
  maxPeriod: number;
}

export function makeAttendingOsc(period = 0.5): AttendingOsc {
  return {
    period,
    anchor: 0,
    etaPeriod: 0.34,
    etaPhase: 0.5,
    gateSigma: 0.62,
    coherence: 0,
    lastOnset: -1,
    onsetCount: 0,
    minPeriod: 0.26,
    maxPeriod: 1.35,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// Fold an inter-onset interval toward the current beat period so that occasional
// held notes (≈2+ beats) or subdivisions (≈½ beat) don't derail the tempo, while
// a moderate rush/drag (0.6..1.75× the beat) is read as a genuine tempo change.
function foldIOI(ioi: number, period: number): number {
  const ratio = ioi / period;
  if (ratio >= 1.75) {
    const f = Math.max(1, Math.round(ratio));
    return ioi / f;
  }
  if (ratio <= 0.6) {
    const f = Math.max(1, Math.round(period / ioi));
    return ioi * f;
  }
  return ioi;
}

/** Phase in [0,1) at time t (0 == on the beat). */
export function computePhase(o: AttendingOsc, t: number): number {
  if (o.period <= 0) return 0;
  let ph = ((t - o.anchor) / o.period) % 1;
  if (ph < 0) ph += 1;
  return ph;
}

/** Absolute time (s) of the earliest beat strictly after `t`. */
export function nextBeatAfter(o: AttendingOsc, t: number): number {
  const k = Math.floor((t - o.anchor) / o.period) + 1;
  return o.anchor + k * o.period;
}

/**
 * Register an onset at time `t` (seconds, any monotonic clock). Mutates the
 * oscillator: bootstraps tempo from the first interval, then applies gated
 * period coupling + phase reset. Returns the alignment (0..1) of this onset.
 */
export function applyOnset(o: AttendingOsc, t: number): number {
  if (o.lastOnset < 0) {
    o.lastOnset = t;
    o.onsetCount = 1;
    o.anchor = t;
    return 1;
  }
  const ioi = t - o.lastOnset;
  o.lastOnset = t;
  o.onsetCount += 1;

  // Ignore implausible double-fires.
  if (ioi < 0.06) return o.coherence;

  // Bootstrap the period from the very first interval.
  if (o.onsetCount === 2) {
    o.period = clamp(ioi, o.minPeriod, o.maxPeriod);
    o.anchor = t;
    o.coherence = 0.35;
    return 0.5;
  }

  // ── Period coupling — gated pull toward the (folded) observed interval.
  const folded = foldIOI(ioi, o.period);
  const relErr = (folded - o.period) / o.period;
  const gate = Math.exp(-(relErr * relErr) / (2 * o.gateSigma * o.gateSigma));
  o.period += o.etaPeriod * gate * (folded - o.period);
  o.period = clamp(o.period, o.minPeriod, o.maxPeriod);

  // ── Phase reset — nudge the beat grid so the nearest beat lands on the onset.
  const k = Math.round((t - o.anchor) / o.period);
  const predBeat = o.anchor + k * o.period;
  o.anchor += o.etaPhase * (t - predBeat);

  // ── Coherence — how tightly this onset hit a predicted beat.
  const beatErr = Math.abs(t - predBeat) / o.period; // 0 == perfect
  const align = Math.exp(-(beatErr * beatErr) / (2 * 0.16 * 0.16));
  o.coherence += 0.22 * (align - o.coherence);
  return align;
}

/** Current tempo in beats per minute. */
export function currentBpm(o: AttendingOsc): number {
  return 60 / o.period;
}
