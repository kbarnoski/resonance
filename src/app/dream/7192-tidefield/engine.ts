// ─────────────────────────────────────────────────────────────────────────────
// Tidefield · engine
//
// A network of slow COUPLED PHASE OSCILLATORS (Kuramoto). The collective
// synchronization order parameter r drives a 7+ minute generative tide: high
// sync = crest/climax, low sync = calm/dispersed. Sections EMERGE from the
// sync↔desync transitions of a continuous dynamical system — memory is the
// state vector, not a script — so the piece never exactly repeats yet always
// has clear long arcs and always returns HOME (D Dorian, low tension).
//
// Everything here is PURE and DETERMINISTIC: seeded mulberry32(0x7192) for all
// randomness (initial phases / natural frequencies / per-oscillator scatter).
// No Math.random, no Date.now, no new Date. Timing is caller-supplied dt.
// Because stepField is a pure function of (state, dt) it can be fast-simulated
// headlessly — see runSimulation / verifyLongForm at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

export const SEED = 0x7192;

/** Tiny seeded PRNG. Deterministic — the ONLY source of randomness. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Arc / coupling constants ────────────────────────────────────────────────
/** Nominal length of the long-form arc (seconds). The piece keeps living past
 *  this, but homecoming (coupling + home-pull) is fully engaged by here. */
export const ARC_SECONDS = 440;
const N = 6;
// Baseline coupling hovers NEAR CRITICAL for the bulk of the arc: with 6
// detuned oscillators that means metastable PARTIAL sync — clusters form and
// break, so r wanders and sections emerge on their own. A slow "tide" breathing
// of the coupling nudges r across the section thresholds. Only in the final
// stretch does coupling ramp hard (K1) with the home pull to force homecoming.
const K0 = 0.17; // near-critical baseline → wandering partial synchronization
const K1 = 1.0; // strong late coupling → the field locks into sync at home
const K_BREATH = 0.09; // amplitude of the slow coupling tide
const K_BREATH_PERIOD = 128; // seconds — a slow swell that drifts r up and down
const HG_MAX = 0.4; // max "home pull" gain — resolves sync toward the HOME phase
const ENERGY_TAU = 30; // conduct energy reabsorbs toward home over ~30 s
const ACCENT_TAU = 2.2; // agogic accent (a held event) relaxes over ~2 s
/** Home phase sits mid-bin so the home chord is stable (no bin-edge flicker). */
const HOME_PHASE = 0.4 * Math.PI * 2;
/** Order-parameter thresholds whose crossings mark section / agogic events. */
const SYNC_THRESHOLDS = [0.34, 0.56, 0.78];

// ── Musical anchoring: D Dorian, home = D minor ─────────────────────────────
/** Root of home. D3 = MIDI 50. */
export const HOME_ROOT_MIDI = 50;
/** D Dorian scale degrees as semitone offsets from D. */
export const DORIAN_STEPS = [0, 2, 3, 5, 7, 9, 10];
/** Chord progression as semitone-offset triads from D. HOME (Dm) is index 2 so
 *  a converged mean phase lands mid-bin on it. Gentle, low-tension motion. */
export const PROGRESSION: ReadonlyArray<readonly number[]> = [
  [5, 9, 12], // G   (IV)
  [7, 10, 14], // Am  (v)
  [0, 3, 7], // Dm  (i)  ← HOME
  [2, 5, 9], // Em  (ii)
  [3, 7, 10], // F   (III)
];
export const HOME_CHORD_INDEX = 2;

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
/** Snap an arbitrary MIDI-ish value to the nearest D Dorian scale tone. */
export function snapToDorian(midi: number): number {
  const rel = midi - HOME_ROOT_MIDI;
  const oct = Math.floor(rel / 12);
  const within = rel - oct * 12;
  let best = DORIAN_STEPS[0];
  let bestD = Infinity;
  for (const s of DORIAN_STEPS) {
    const d = Math.abs(s - within);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return HOME_ROOT_MIDI + oct * 12 + best;
}

// ── State + readout types ────────────────────────────────────────────────────
export interface FieldState {
  phases: number[]; // θ_i
  freqs: number[]; // ω_i natural angular frequency (rad/s)
  pert: number[]; // per-oscillator deterministic scatter direction
  t: number; // elapsed seconds
  energy: number; // conduct energy (0..~1.2), reabsorbs toward 0
  accent: number; // decaying agogic-accent charge (0..1)
  orderPrev: number; // last order parameter (for transition detection)
}

export type Section =
  | "Dispersal"
  | "Gathering"
  | "Swell"
  | "Crest"
  | "Homecoming";

export interface FieldReadout {
  t: number;
  order: number; // synchronization order parameter r ∈ [0,1]
  meanPhase: number; // ψ ∈ (-π, π]
  tideLevel: number; // 0..1 water height
  tension: number; // 0..1 (home = low)
  density: number; // 0..1 event density
  brightness: number; // 0..1 luminance / timbral openness
  energy: number;
  coupling: number; // effective K this step
  chordIndex: number; // index into PROGRESSION
  section: Section;
  phases: number[]; // copy of θ_i (for visual phase points)
  rubato: number[]; // per-voice lead(+)/lag(-) fraction from phase velocity
  accent: number; // current agogic-accent charge (lengthen held events)
  syncTransition: boolean; // a threshold was crossed THIS step
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
const TWO_PI = Math.PI * 2;
function wrap(a: number): number {
  a = a % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Build a fresh deterministic field. Same seed → identical field, always. */
export function createField(seed: number = SEED): FieldState {
  const rng = mulberry32(seed);
  const phases: number[] = [];
  const freqs: number[] = [];
  const pert: number[] = [];
  // Natural periods span tens of seconds → minutes; slightly detuned so the
  // uncoupled field drifts through long, non-repeating configurations.
  const basePeriods = [23, 34, 47, 61, 79, 96];
  for (let i = 0; i < N; i++) {
    phases.push(rng() * TWO_PI);
    const jitter = 0.85 + rng() * 0.3; // ±15% period jitter
    const period = basePeriods[i] * jitter;
    freqs.push(TWO_PI / period);
    pert.push((rng() * 2 - 1) * 0.06); // scatter direction for conduct energy
  }
  // Seed order parameter from the initial phases.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < N; i++) {
    sx += Math.cos(phases[i]);
    sy += Math.sin(phases[i]);
  }
  return {
    phases,
    freqs,
    pert,
    t: 0,
    energy: 0,
    accent: 0,
    orderPrev: Math.hypot(sx / N, sy / N),
  };
}

/** Nudge the field's energy UP (a breath / tilt / slider push). The field
 *  reabsorbs it back toward home over ~ENERGY_TAU seconds. */
export function applyConduct(s: FieldState, amount: number): void {
  s.energy = clamp(s.energy + amount, 0, 1.3);
}

/** Advance the field by dt seconds and return a fresh readout.
 *  PURE w.r.t. randomness — mutates only the passed state. */
export function stepField(s: FieldState, dt: number): FieldReadout {
  dt = clamp(dt, 0, 0.1); // robustness: never integrate a huge frame
  s.t += dt;
  const prog = clamp01(s.t / ARC_SECONDS);
  // Homecoming curve: coupling + home pull stay dormant for the bulk of the arc
  // and engage in the final ~30% (a slow drift that strengthens over time).
  const late = smoothstep(clamp01((prog - 0.66) / 0.34));
  // Opening: coupling starts near zero so the seeded (mildly coherent) phases
  // drift apart under their detuned natural rates → a calm, dispersed dawn →
  // then partial sync builds. `open` fades the baseline in over the first ~50 s.
  const open = smoothstep(clamp01(s.t / 50));
  const breath = K_BREATH * Math.sin((TWO_PI * s.t) / K_BREATH_PERIOD) * open;
  const K = 0.012 + (K0 - 0.012) * open + breath + (K1 - K0) * late;
  const Hgain = HG_MAX * late;

  // Conduct energy reabsorbs toward 0 (homecoming of the perturbation).
  s.energy += -(s.energy / ENERGY_TAU) * dt;
  if (s.energy < 1e-4) s.energy = 0;
  const energy = s.energy;
  // A breath DISPERSES: it transiently weakens coupling, then reabsorbs and
  // the field re-coheres → return home.
  const Keff = K * (1 - 0.7 * clamp01(energy));

  // Per-voice angular velocity (natural + coupling + home pull + scatter).
  const vel = new Array<number>(N);
  const rubato = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    let coup = 0;
    for (let j = 0; j < N; j++) coup += Math.sin(s.phases[j] - s.phases[i]);
    coup = (Keff / N) * coup;
    const home = Hgain * Math.sin(HOME_PHASE - s.phases[i]);
    const pert = energy * s.pert[i];
    const v = s.freqs[i] + coup + home + pert;
    vel[i] = v;
    // Agogic rubato: instantaneous phase velocity vs the voice's natural rate.
    // Faster than natural → lean EARLY (+); slower → LAG (−).
    rubato[i] = clamp((v - s.freqs[i]) / s.freqs[i], -0.6, 0.6);
  }
  for (let i = 0; i < N; i++) s.phases[i] = wrap(s.phases[i] + vel[i] * dt);

  // Order parameter r·e^{iψ} = (1/N) Σ e^{iθ}.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < N; i++) {
    sx += Math.cos(s.phases[i]);
    sy += Math.sin(s.phases[i]);
  }
  sx /= N;
  sy /= N;
  const order = Math.hypot(sx, sy);
  const meanPhase = Math.atan2(sy, sx);

  // Sync-transition detection → AGOGIC ACCENT (mark the event by DURATION):
  // when r crosses a threshold, charge the accent so the next event is HELD.
  let syncTransition = false;
  for (const th of SYNC_THRESHOLDS) {
    if ((s.orderPrev - th) * (order - th) < 0) {
      syncTransition = true;
      break;
    }
  }
  s.orderPrev = order;
  if (syncTransition) s.accent = 1;
  s.accent += -(s.accent / ACCENT_TAU) * dt;
  if (s.accent < 1e-4) s.accent = 0;

  // Musical mapping. HOME (high order, low tension) is the resolved state.
  const tideLevel = clamp01(
    0.34 + 0.42 * order + 0.12 * Math.sin(s.phases[0]) + 0.1 * energy
  );
  const tension = clamp01(
    (1 - order) * 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(s.phases[3]))
  );
  const density = clamp01(
    0.28 + 0.45 * (0.5 + 0.5 * Math.sin(s.phases[2])) + 0.22 * order
  );
  const brightness = clamp01(0.26 + 0.5 * order + 0.35 * energy);

  // Harmonic motion: mean phase picks the chord; converged home phase → Dm.
  const u = ((meanPhase / TWO_PI) % 1 + 1) % 1;
  const chordIndex = Math.min(
    PROGRESSION.length - 1,
    Math.floor(u * PROGRESSION.length)
  );

  // Section EMERGES from sync + arc position (not a discrete script).
  let section: Section;
  if (prog > 0.82 && order > 0.72) section = "Homecoming";
  else if (order < 0.34) section = "Dispersal";
  else if (order < 0.56) section = "Gathering";
  else if (order < 0.78) section = "Swell";
  else section = "Crest";

  return {
    t: s.t,
    order,
    meanPhase,
    tideLevel,
    tension,
    density,
    brightness,
    energy,
    coupling: Keff,
    chordIndex,
    section,
    phases: s.phases.slice(),
    rubato,
    accent: s.accent,
    syncTransition,
  };
}

// ── Headless long-form self-verification ─────────────────────────────────────
export interface LongFormReport {
  durationSeconds: number;
  samples: number;
  duplicateStateVectors: number; // (a) must be 0
  minute1to5Distance: number; // (b) must be > 0 (measurably different)
  endOrder: number; // (c) high = synced
  endTension: number; // (c) low = home
  endChordIndex: number; // (c) HOME_CHORD_INDEX = home
  homecomingReached: boolean; // (c) summary
}

/** Fast-simulate the field for `duration` seconds at fixed `dt`, sampling the
 *  state vector every `sampleEvery` seconds. Deterministic. */
export function runSimulation(
  duration = ARC_SECONDS,
  dt = 1 / 60,
  sampleEvery = 2,
  seed = SEED
): { readouts: FieldReadout[]; times: number[] } {
  const s = createField(seed);
  const readouts: FieldReadout[] = [];
  const times: number[] = [];
  let nextSample = 0;
  let last: FieldReadout | null = null;
  const steps = Math.ceil(duration / dt);
  for (let k = 0; k < steps; k++) {
    last = stepField(s, dt);
    if (last.t >= nextSample) {
      readouts.push(last);
      times.push(last.t);
      nextSample += sampleEvery;
    }
  }
  if (last && times[times.length - 1] !== last.t) {
    readouts.push(last);
    times.push(last.t);
  }
  return { readouts, times };
}

/** Run the ~7-minute simulation and confirm the three long-form guarantees. */
export function verifyLongForm(duration = 420): LongFormReport {
  const { readouts, times } = runSimulation(duration);

  // (a) zero exact-duplicate sampled state vectors (phase vectors).
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of readouts) {
    const key = r.phases.map((p) => p.toFixed(6)).join(",");
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }

  // (b) minute-1 state measurably differs from minute-5.
  const at = (sec: number): FieldReadout => {
    let best = readouts[0];
    let bestD = Infinity;
    for (let i = 0; i < readouts.length; i++) {
      const d = Math.abs(times[i] - sec);
      if (d < bestD) {
        bestD = d;
        best = readouts[i];
      }
    }
    return best;
  };
  const m1 = at(60);
  const m5 = at(300);
  let dist = 0;
  for (let i = 0; i < m1.phases.length; i++) {
    // Circular phase distance so wrap-around doesn't understate difference.
    let d = Math.abs(m1.phases[i] - m5.phases[i]) % TWO_PI;
    if (d > Math.PI) d = TWO_PI - d;
    dist += d * d;
  }
  dist = Math.sqrt(dist);

  // (c) field returned toward home by the end.
  const end = readouts[readouts.length - 1];
  const homecomingReached =
    end.order > 0.7 && end.tension < 0.3 && end.chordIndex === HOME_CHORD_INDEX;

  return {
    durationSeconds: duration,
    samples: readouts.length,
    duplicateStateVectors: duplicates,
    minute1to5Distance: dist,
    endOrder: end.order,
    endTension: end.tension,
    endChordIndex: end.chordIndex,
    homecomingReached,
  };
}
