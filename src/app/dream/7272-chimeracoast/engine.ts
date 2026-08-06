// ─────────────────────────────────────────────────────────────────────────────
// Chimeracoast · engine  (cycle 2 of 7192-tidefield)
//
// A RING of identical, NONLOCALLY-coupled phase oscillators — the classic
// Kuramoto–Battogtokh / Abrams–Strogatz chimera. Index i = angular position
// around a coastline ring. Each oscillator couples to the whole ring through a
// distance-dependent cosine kernel G(Δ) = 1 + A·cos(Δ) (strong locally, weak far
// away) with a Sakaguchi phase-lag α near π/2. In that regime the ring
// spontaneously SPLITS: a contiguous ARC locks into a coherent, in-tune wave
// (high LOCAL order parameter) while the rest of the coast stays choppy and
// incoherent — and the coherent arc slowly DRIFTS around the ring.
//
// Over a ~7-minute arc a slow tide of the phase-lag α makes chimera episodes
// come and go; a late homecoming ramp collapses α toward 0 and adds a home pull
// so the WHOLE ring synchronizes into one home wave (D Dorian, Dm, low tension).
//
// Everything is PURE and DETERMINISTIC: seeded mulberry32(0x7272) for the only
// randomness (initial phase profile + per-oscillator kick directions). No
// Math.random, no Date.now, no new Date. Timing is caller-supplied dt, so the
// whole thing fast-simulates headlessly — see runSimulation / verifyLongForm.
// ─────────────────────────────────────────────────────────────────────────────

export const SEED = 0x7272;

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

// ── Ring / chimera constants ─────────────────────────────────────────────────
/** Nominal length of the long-form arc (seconds). The piece keeps living past
 *  this, but homecoming is fully engaged by here. */
export const ARC_SECONDS = 420;
/** Number of oscillators on the ring (coastline resolution). */
export const N = 40;
/** Cosine-kernel non-locality A ∈ (0,1]: G(Δ)=1+A·cos(Δ). Near 1 → coupling is
 *  concentrated locally, which is what lets a coherent arc coexist with an
 *  incoherent one (a chimera) rather than the whole ring locking or drifting. */
const KERNEL_A = 0.9;
/** Overall coupling rate — sets how fast the ring dynamics evolve (arb. units). */
const COUPLE_RATE = 0.85;
/** Common natural frequency (rad/s). Identical for every oscillator (chimera
 *  needs identical units); it only rotates the whole ring, so it moves the mean
 *  phase (harmonic motion) without touching the coherent/incoherent split. It is
 *  faded out at homecoming so the ring settles on the HOME phase. */
const OMEGA = 0.16;

// Sakaguchi phase-lag α tide. Chimera lives in a band of α just below π/2:
// higher α (→π/2) → the coast goes choppy/incoherent; lower α → it locks up.
// A slow two-rate sweep walks α through the chimera band so coherent episodes
// wax and wane, never repeating. Exposed as a mutable object so the headless
// tuner can sweep them; the defaults are the shipped regime.
export const TUNE = {
  alphaCenter: 1.457, // ~ π/2 − 0.114 — inside the chimera band (Abrams β≈0.11)
  alphaSwing: 0.052,
  alphaPeriod1: 96, // s
  alphaPeriod2: 61, // s
  alphaHome: 0.02, // homecoming target: ~0 → purely attractive coupling → full sync
};

/** Local order parameter window half-width (oscillators each side). The arc is
 *  detected as the contiguous span of high local order over this sliding window. */
export const LOCAL_WIN = 5;

const HG_MAX = 0.7; // max home-pull gain (engaged only at homecoming)
const ENERGY_TAU = 26; // conduct energy reabsorbs toward home over ~26 s
const ACCENT_TAU = 2.2; // agogic accent (a held event) relaxes over ~2 s
/** Home phase sits MID-BIN (u=0.5 → chord bin 2 = Dm) so the home chord is
 *  stable under small phase offsets — no bin-edge flicker. */
const HOME_PHASE = 0.5 * Math.PI * 2;
/** Local-order thresholds whose crossings (per arc) mark agogic bell events. */
const LOCAL_THRESHOLDS = [0.45, 0.7, 0.9];

// ── Musical anchoring: D Dorian, home = D minor ──────────────────────────────
/** Root of home. D3 = MIDI 50. */
export const HOME_ROOT_MIDI = 50;
/** D Dorian scale degrees as semitone offsets from D. */
export const DORIAN_STEPS = [0, 2, 3, 5, 7, 9, 10];
/** Chord progression as semitone-offset triads from D. HOME (Dm) is index 2 so a
 *  converged mean phase lands mid-bin on it. Gentle, low-tension motion. */
export const PROGRESSION: ReadonlyArray<readonly number[]> = [
  [5, 9, 12], // G   (IV)
  [7, 10, 14], // Am  (v)
  [0, 3, 7], // Dm  (i)  ← HOME
  [2, 5, 9], // Em  (ii)
  [3, 7, 10], // F   (III)
];
export const HOME_CHORD_INDEX = 2;
export const CHORD_NAMES = ["G", "Am", "Dm", "Em", "F"] as const;

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
export interface RingState {
  phases: number[]; // θ_i around the ring
  kick: number[]; // per-oscillator deterministic perturbation direction
  cosTable: number[]; // cos(2π d / N) for d = 0..N-1 (kernel, precomputed)
  t: number; // elapsed seconds
  energy: number; // conduct energy (0..~1.3), reabsorbs toward 0
  accent: number; // decaying agogic-accent charge (0..1)
  localPrev: number[]; // last local-order profile (for threshold crossings)
}

export type Section =
  | "Choppy coast"
  | "Gathering"
  | "Travelling chimera"
  | "Wide swell"
  | "Homecoming";

export interface RingReadout {
  t: number;
  phases: number[]; // copy of θ_i (visual ring points)
  localOrder: number[]; // per-position local order parameter (0..1)
  globalOrder: number; // whole-ring order parameter r ∈ [0,1]
  meanPhase: number; // ψ ∈ (-π, π]
  arcCenterAngle: number; // coherent-arc centre, ring angle 0..2π
  arcCenterPan: number; // −1..1 stereo pan from the arc centre
  arcCoherence: number; // max local order along the ring (arc tightness)
  incoherence: number; // 1 − min local order (choppiness of the worst region)
  arcWidth: number; // 0..1 fraction of ring that is coherent
  chimeraMetric: number; // max_local − min_local (>~0.4 = genuine chimera)
  alpha: number; // effective Sakaguchi phase-lag this step
  tension: number; // 0..1 (home = low)
  brightness: number; // 0..1 timbral openness / luminance
  density: number; // 0..1 event density
  energy: number;
  chordIndex: number; // index into PROGRESSION
  section: Section;
  accent: number; // agogic-accent charge (lengthen held events)
  localCrossing: boolean; // an arc local-order threshold was crossed this step
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

/** Build a fresh deterministic ring. Same seed → identical ring, always.
 *  Initial condition plants a localized coherent bump (an incipient arc) in a
 *  choppy sea — this nucleates the chimera the dynamics then sustain and move. */
export function createRing(seed: number = SEED): RingState {
  const rng = mulberry32(seed);
  const phases: number[] = new Array(N);
  const kick: number[] = new Array(N);
  // A coherent seed arc centred a third of the way round; incoherent elsewhere.
  const centre = Math.floor(N * 0.33);
  const halfArc = Math.floor(N * 0.16);
  for (let i = 0; i < N; i++) {
    let d = Math.abs(i - centre);
    d = Math.min(d, N - d); // ring distance
    const inArc = d <= halfArc;
    if (inArc) {
      // Nearly aligned (small scatter) → high local order in the seed arc.
      phases[i] = wrap(HOME_PHASE + (rng() * 2 - 1) * 0.35);
    } else {
      // Fully scattered → incoherent coast.
      phases[i] = rng() * TWO_PI;
    }
    kick[i] = (rng() * 2 - 1) * 0.9; // conduct perturbation direction
  }
  const cosTable: number[] = new Array(N);
  for (let d = 0; d < N; d++) cosTable[d] = Math.cos((TWO_PI * d) / N);
  return {
    phases,
    kick,
    cosTable,
    t: 0,
    energy: 0,
    accent: 0,
    localPrev: computeLocalOrder(phases),
  };
}

/** Local order parameter r_local(i) = |mean e^{iθ}| over a sliding ring window
 *  of half-width LOCAL_WIN. High along the coherent arc, low in the choppy sea. */
export function computeLocalOrder(phases: number[]): number[] {
  const out = new Array<number>(N);
  const win = 2 * LOCAL_WIN + 1;
  for (let i = 0; i < N; i++) {
    let sx = 0;
    let sy = 0;
    for (let k = -LOCAL_WIN; k <= LOCAL_WIN; k++) {
      const j = (i + k + N) % N;
      sx += Math.cos(phases[j]);
      sy += Math.sin(phases[j]);
    }
    out[i] = Math.hypot(sx, sy) / win;
  }
  return out;
}

/** Nudge the ring's energy UP (a breath / tilt / slider push). The ring
 *  reabsorbs it back toward home over ~ENERGY_TAU seconds — the perturbation
 *  disperses the coherent arc, then the arc re-forms. */
export function applyConduct(s: RingState, amount: number): void {
  s.energy = clamp(s.energy + amount, 0, 1.3);
}

/** Advance the ring by dt seconds and return a fresh readout.
 *  PURE w.r.t. randomness — mutates only the passed state. */
export function stepRing(s: RingState, dt: number): RingReadout {
  dt = clamp(dt, 0, 0.1); // robustness: never integrate a huge frame
  s.t += dt;
  const prog = clamp01(s.t / ARC_SECONDS);
  // Homecoming curve: engages in the final ~30% of the arc.
  const late = smoothstep(clamp01((prog - 0.68) / 0.32));
  // Opening: let the seed arc establish before the α tide starts breathing.
  const open = smoothstep(clamp01(s.t / 30));

  // Conduct energy reabsorbs toward 0 (homecoming of the perturbation).
  s.energy += -(s.energy / ENERGY_TAU) * dt;
  if (s.energy < 1e-4) s.energy = 0;
  const energy = s.energy;

  // Sakaguchi phase-lag tide. Breathes through the chimera band during the bulk;
  // a breath (energy) pushes α toward π/2 → transiently disperses the arc; the
  // homecoming ramp collapses α toward 0 → the whole ring synchronizes.
  const swing =
    TUNE.alphaSwing *
    open *
    (0.62 * Math.sin((TWO_PI * s.t) / TUNE.alphaPeriod1) +
      0.38 * Math.sin((TWO_PI * s.t) / TUNE.alphaPeriod2 + 1.3));
  let alpha = TUNE.alphaCenter + swing + energy * 0.22;
  alpha = alpha + (TUNE.alphaHome - alpha) * late;
  alpha = clamp(alpha, 0.02, Math.PI / 2 - 0.005);

  const omegaEff = OMEGA * (1 - late);
  const Hgain = HG_MAX * late;
  const A = KERNEL_A;
  const cosT = s.cosTable;

  // Nonlocal-ring update (Abrams–Strogatz form):
  //   dθ_i/dt = ω − (COUPLE_RATE/N) Σ_j G(i−j) · sin(θ_i − θ_j + α)
  // with G(Δ) = 1 + A·cos(Δ). Plus a homecoming pull and a conduct kick.
  const vel = new Array<number>(N);
  const ph = s.phases;
  for (let i = 0; i < N; i++) {
    let acc = 0;
    const ti = ph[i];
    for (let j = 0; j < N; j++) {
      const d = i - j;
      const g = 1 + A * cosT[d < 0 ? d + N : d];
      acc += g * Math.sin(ti - ph[j] + alpha);
    }
    const coupling = -(COUPLE_RATE / N) * acc;
    const home = Hgain * Math.sin(HOME_PHASE - ti);
    const kick = energy * s.kick[i] * 0.5;
    vel[i] = omegaEff + coupling + home + kick;
  }
  for (let i = 0; i < N; i++) ph[i] = wrap(ph[i] + vel[i] * dt);

  // ── Coherence geometry ─────────────────────────────────────────────────────
  const localOrder = computeLocalOrder(ph);
  let maxLocal = -1;
  let minLocal = 2;
  let maxIdx = 0;
  for (let i = 0; i < N; i++) {
    if (localOrder[i] > maxLocal) {
      maxLocal = localOrder[i];
      maxIdx = i;
    }
    if (localOrder[i] < minLocal) minLocal = localOrder[i];
  }
  const chimeraMetric = maxLocal - minLocal;
  // Coherent-arc centre: circular mean of ring positions weighted by how far
  // each local order sits above the midline (so the choppy sea barely counts).
  const mid = 0.5 * (maxLocal + minLocal);
  let wx = 0;
  let wy = 0;
  let wsum = 0;
  let coherentCount = 0;
  const coherThresh = mid + 0.15 * (maxLocal - mid);
  for (let i = 0; i < N; i++) {
    const w = Math.max(0, localOrder[i] - mid);
    const ang = (TWO_PI * i) / N;
    wx += w * Math.cos(ang);
    wy += w * Math.sin(ang);
    wsum += w;
    if (localOrder[i] >= coherThresh) coherentCount++;
  }
  const arcCenterAngle =
    wsum > 1e-6 ? wrap(Math.atan2(wy, wx)) : (TWO_PI * maxIdx) / N;
  const arcCenterPan = Math.sin(arcCenterAngle);
  const arcWidth = coherentCount / N;

  // Whole-ring order parameter r·e^{iψ} = (1/N) Σ e^{iθ}.
  let gx = 0;
  let gy = 0;
  for (let i = 0; i < N; i++) {
    gx += Math.cos(ph[i]);
    gy += Math.sin(ph[i]);
  }
  gx /= N;
  gy /= N;
  const globalOrder = Math.hypot(gx, gy);
  const meanPhase = Math.atan2(gy, gx);

  // ── Agogic accent: a local-order threshold crossing at the arc peak HOLDS the
  // next event (marks it by duration, not loudness). ──────────────────────────
  let localCrossing = false;
  const peakPrev = s.localPrev[maxIdx] ?? maxLocal;
  for (const th of LOCAL_THRESHOLDS) {
    if ((peakPrev - th) * (maxLocal - th) < 0) {
      localCrossing = true;
      break;
    }
  }
  s.localPrev = localOrder;
  if (localCrossing) s.accent = 1;
  s.accent += -(s.accent / ACCENT_TAU) * dt;
  if (s.accent < 1e-4) s.accent = 0;

  // ── Musical mapping ─────────────────────────────────────────────────────────
  const arcCoherence = maxLocal;
  const incoherence = 1 - minLocal;
  // Home = high global order, low tension. Chimera episodes carry mid tension.
  const tension = clamp01(
    (1 - globalOrder) * 0.7 + chimeraMetric * 0.3 - late * 0.25
  );
  const brightness = clamp01(0.22 + 0.55 * arcCoherence + 0.25 * energy);
  const density = clamp01(0.25 + 0.5 * arcCoherence + 0.2 * chimeraMetric);

  // Harmonic motion: mean phase picks the chord; converged home phase → Dm.
  const u = (((meanPhase / TWO_PI) % 1) + 1) % 1;
  const chordIndex = Math.min(
    PROGRESSION.length - 1,
    Math.floor(u * PROGRESSION.length)
  );

  // Section EMERGES from the coherence geometry (not a discrete script).
  let section: Section;
  if (late > 0.5 && globalOrder > 0.7) section = "Homecoming";
  else if (globalOrder > 0.72) section = "Wide swell";
  else if (chimeraMetric > 0.4) section = "Travelling chimera";
  else if (globalOrder < 0.32) section = "Choppy coast";
  else section = "Gathering";

  return {
    t: s.t,
    phases: ph.slice(),
    localOrder: localOrder.slice(),
    globalOrder,
    meanPhase,
    arcCenterAngle,
    arcCenterPan,
    arcCoherence,
    incoherence,
    arcWidth,
    chimeraMetric,
    alpha,
    tension,
    brightness,
    density,
    energy,
    chordIndex,
    section,
    accent: s.accent,
    localCrossing,
  };
}

// ── Headless long-form self-verification ─────────────────────────────────────
export interface LongFormReport {
  durationSeconds: number;
  samples: number;
  duplicateStateVectors: number; // (a) must be 0
  minute1to5Distance: number; // (b) must be > 0 (measurably different)
  endGlobalOrder: number; // (c) high = synced
  endTension: number; // (c) low = home
  endChordIndex: number; // (c) HOME_CHORD_INDEX = home
  homecomingReached: boolean; // (c) summary
  maxChimeraMetric: number; // (d) peak coexistence of coherent + incoherent arc
  chimeraEpisodes: number; // (d) count of samples over the chimera threshold
  chimeraDetected: boolean; // (d) summary
}

/** Fast-simulate the ring for `duration` seconds at fixed `dt`, sampling the
 *  state vector every `sampleEvery` seconds. Deterministic. */
export function runSimulation(
  duration = ARC_SECONDS,
  dt = 1 / 60,
  sampleEvery = 2,
  seed = SEED
): { readouts: RingReadout[]; times: number[] } {
  const s = createRing(seed);
  const readouts: RingReadout[] = [];
  const times: number[] = [];
  let nextSample = 0;
  let last: RingReadout | null = null;
  const steps = Math.ceil(duration / dt);
  for (let k = 0; k < steps; k++) {
    last = stepRing(s, dt);
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

/** Run the ~7-minute simulation and confirm the four long-form guarantees. */
export function verifyLongForm(duration = 420): LongFormReport {
  const { readouts, times } = runSimulation(duration);

  // (a) zero exact-duplicate sampled state vectors (phase vectors).
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of readouts) {
    const key = r.phases.map((p) => p.toFixed(5)).join(",");
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }

  // (b) minute-1 state measurably differs from minute-5.
  const at = (sec: number): RingReadout => {
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
    let d = Math.abs(m1.phases[i] - m5.phases[i]) % TWO_PI;
    if (d > Math.PI) d = TWO_PI - d;
    dist += d * d;
  }
  dist = Math.sqrt(dist);

  // (c) ring returned toward home by the end.
  const end = readouts[readouts.length - 1];
  const homecomingReached =
    end.globalOrder > 0.7 &&
    end.tension < 0.3 &&
    end.chordIndex === HOME_CHORD_INDEX;

  // (d) at least one genuine chimera episode: a high-local-order arc AND a
  // low-local-order region coexisting (max_local − min_local > ~0.4).
  let maxChimeraMetric = 0;
  let chimeraEpisodes = 0;
  for (const r of readouts) {
    if (r.chimeraMetric > maxChimeraMetric) maxChimeraMetric = r.chimeraMetric;
    if (r.chimeraMetric > 0.4) chimeraEpisodes++;
  }
  const chimeraDetected = maxChimeraMetric > 0.4 && chimeraEpisodes > 0;

  return {
    durationSeconds: duration,
    samples: readouts.length,
    duplicateStateVectors: duplicates,
    minute1to5Distance: dist,
    endGlobalOrder: end.globalOrder,
    endTension: end.tension,
    endChordIndex: end.chordIndex,
    homecomingReached,
    maxChimeraMetric,
    chimeraEpisodes,
    chimeraDetected,
  };
}
