// roughness.ts — Plomp–Levelt / Sethares sensory-roughness estimate.
//
// Given a set of currently-sounding partials (frequency + amplitude), estimate
// the perceived dissonance ("sensory roughness") of the aggregate sound. This
// is the live signal that the ensemble conducts itself toward: the conductor's
// TENSION dial sets a target on this same scale.
//
// We use the classic Sethares parametric dissonance curve between every pair
// of partials and sum the contributions, normalised to roughly [0, 1] for the
// chord densities this prototype produces.

export interface Partial {
  freq: number; // Hz
  amp: number; // 0..1 linear amplitude
}

// Sethares (1993) dissonance between two partials.
// Returns an unnormalised roughness contribution.
function pairRoughness(f1: number, a1: number, f2: number, a2: number): number {
  if (f1 <= 0 || f2 <= 0) return 0;
  const fmin = Math.min(f1, f2);
  const fmax = Math.max(f1, f2);
  // Sethares constants
  const b1 = 3.5;
  const b2 = 5.75;
  const s1 = 0.0207;
  const s2 = 18.96;
  const s = 0.24 / (s1 * fmin + s2);
  const df = fmax - fmin;
  const a = Math.min(a1, a2); // loudness of the quieter partial dominates
  return a * (Math.exp(-b1 * s * df) - Math.exp(-b2 * s * df));
}

// Aggregate sensory roughness over all sounding partials.
// Normalised so a clean unison/octave ~0 and a dense cluster ~1.
export function computeRoughness(partials: Partial[]): number {
  if (partials.length < 2) return 0;
  let total = 0;
  let ampSum = 0;
  for (let i = 0; i < partials.length; i++) {
    ampSum += partials[i].amp;
    for (let j = i + 1; j < partials.length; j++) {
      total += pairRoughness(
        partials[i].freq,
        partials[i].amp,
        partials[j].freq,
        partials[j].amp,
      );
    }
  }
  // Normalise by total energy so loudness alone doesn't read as dissonance.
  const norm = ampSum > 0 ? total / ampSum : 0;
  // Empirical scaling into ~[0,1].
  return Math.max(0, Math.min(1, norm * 3.2));
}

// Convert a MIDI note to frequency.
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Build the partial list for a note given a timbre's relative partial weights.
// `partials` are amplitude multipliers for harmonics 1..N.
export function notePartials(
  midi: number,
  amp: number,
  partialWeights: number[],
): Partial[] {
  const f0 = midiToFreq(midi);
  const out: Partial[] = [];
  for (let h = 0; h < partialWeights.length; h++) {
    const w = partialWeights[h];
    if (w <= 0) continue;
    out.push({ freq: f0 * (h + 1), amp: amp * w });
  }
  return out;
}

// Predict the roughness if a candidate note were added to the existing
// sounding partials. Used by agents to bias their next-note choice toward /
// away from the conductor's tension target.
export function roughnessWithCandidate(
  existing: Partial[],
  candidateMidi: number,
  candidateAmp: number,
  candidateWeights: number[],
): number {
  const cand = notePartials(candidateMidi, candidateAmp, candidateWeights);
  return computeRoughness(existing.concat(cand));
}
