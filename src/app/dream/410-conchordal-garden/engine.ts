/**
 * Conchordal Garden — Simulation + Audio Engine
 *
 * Implements:
 *  - Plomp–Levelt roughness model over additive partials
 *  - Harmonicity bonus for small-integer ratios
 *  - Greedy/Metropolis pitch search with crowding penalty
 *  - Kuramoto phase coupling (θ, ω) for tremolo/breathing
 *  - Web Audio additive synthesis per organism
 *  - Smooth glide via setTargetAtTime
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const FREQ_MIN = 130;   // Hz (C3)
export const FREQ_MAX = 780;   // Hz (~G5)
export const N_HARMONICS = 5;  // partials per voice
export const POP_INIT = 24;
export const POP_MAX = 40;
export const POP_MIN = 6;      // re-seed floor
export const SIM_HZ = 20;      // sim ticks/sec (decoupled from rAF)

// Small-integer JI ratios to reward
const JI_RATIOS = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2 / 1];

// Plomp–Levelt curve parameter
const CB_SLOPE_A = 0.24;
const CB_DENOM_A = 0.0207;
const CB_DENOM_B = 18.96;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Organism {
  id: number;
  freq: number;       // fundamental Hz (mutable)
  health: number;     // 0..1
  phase: number;      // Kuramoto θ (radians)
  omega: number;      // Kuramoto natural freq (rad/s, ~0.1–0.4 Hz → 0.6–2.5 rad/s)
  consonance: number; // last computed fitness (for display)
  age: number;        // seconds since birth
  alive: boolean;
  // Audio nodes (null until AudioContext exists)
  oscs: OscillatorNode[] | null;
  gainNode: GainNode | null;
  tremGain: GainNode | null;
}

export interface SimState {
  organisms: Organism[];
  time: number;
  elapsed: number;
  meanConsonance: number;
}

// ── Roughness helpers ──────────────────────────────────────────────────────────

/**
 * Plomp–Levelt roughness between two partials at frequencies f1, f2
 * with amplitudes a1, a2.
 */
function plRoughness(f1: number, a1: number, f2: number, a2: number): number {
  const fmin = Math.min(f1, f2);
  const cb = CB_DENOM_A * fmin + CB_DENOM_B;
  const x = CB_SLOPE_A * Math.abs(f1 - f2) / cb;
  return a1 * a2 * (Math.exp(-3.5 * x) - Math.exp(-5.75 * x));
}

/**
 * Harmonicity bonus: reward proximity to small-integer ratios.
 * Returns a positive number 0..1.
 */
function harmonicityBonus(fA: number, fB: number): number {
  const r = fA > fB ? fA / fB : fB / fA;
  let best = Infinity;
  for (const ji of JI_RATIOS) {
    const diff = Math.abs(r - ji);
    if (diff < best) best = diff;
    // Also check octave multiples
    const diff2 = Math.abs(r / 2 - ji);
    if (diff2 < best) best = diff2;
  }
  // Tolerance ~50 cents = ratio ~0.029
  return Math.max(0, 1 - best / 0.06);
}

/**
 * Compute the partials (freq[], amp[]) for an organism.
 */
function getPartials(freq: number): { f: number[]; a: number[] } {
  const f: number[] = [];
  const a: number[] = [];
  for (let n = 1; n <= N_HARMONICS; n++) {
    f.push(freq * n);
    a.push(1 / n);
  }
  return { f, a };
}

/**
 * Total roughness of a candidate frequency against a list of sounding organisms.
 * Returns { roughness, bonus } — fitness = -roughness + bonus.
 */
export function computeFitness(
  candidateFreq: number,
  others: Organism[],
  excludeId: number,
): { roughness: number; bonus: number; fitness: number } {
  const { f: cf, a: ca } = getPartials(candidateFreq);
  let totalRoughness = 0;
  let totalBonus = 0;

  for (const o of others) {
    if (o.id === excludeId || !o.alive) continue;
    const { f: of_, a: oa } = getPartials(o.freq);

    // All partial pair combinations
    for (let i = 0; i < cf.length; i++) {
      for (let j = 0; j < of_.length; j++) {
        // Only count pairs within ~3 octaves (for performance)
        if (cf[i] > 8000 || of_[j] > 8000) continue;
        totalRoughness += plRoughness(cf[i], ca[i], of_[j], oa[j]);
      }
    }
    totalBonus += harmonicityBonus(candidateFreq, o.freq);
  }

  // Normalize by count
  const n = others.filter((o) => o.id !== excludeId && o.alive).length;
  if (n > 0) {
    totalRoughness /= n;
    totalBonus /= n;
  }

  return { roughness: totalRoughness, bonus: totalBonus, fitness: -totalRoughness + totalBonus * 0.4 };
}

/**
 * Crowding penalty: pushes organisms away from each other in freq space.
 */
function crowdingPenalty(freq: number, others: Organism[], excludeId: number): number {
  const LOG_MIN_DIST = Math.log2(1.02); // ~35 cents
  let penalty = 0;
  for (const o of others) {
    if (o.id === excludeId || !o.alive) continue;
    const dist = Math.abs(Math.log2(freq / o.freq));
    if (dist < LOG_MIN_DIST) {
      penalty += (LOG_MIN_DIST - dist) / LOG_MIN_DIST * 0.5;
    }
  }
  return penalty;
}

// ── Organism factory ───────────────────────────────────────────────────────────

let _nextId = 0;

export function createOrganism(freq?: number): Organism {
  const f =
    freq ??
    FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, Math.random());
  return {
    id: _nextId++,
    freq: f,
    health: 0.2 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    omega: (0.1 + Math.random() * 0.3) * 2 * Math.PI, // 0.1–0.4 Hz in rad/s
    consonance: 0,
    age: 0,
    alive: true,
    oscs: null,
    gainNode: null,
    tremGain: null,
  };
}

// ── Simulation step ────────────────────────────────────────────────────────────

const METROPOLIS_TEMP = 0.08;  // acceptance temperature
const HEALTH_COST = 0.015;     // base metabolic cost
const HEALTH_GAIN_K = 0.25;    // consonance → health gain
const HEALTH_DECAY = 0.008;    // extra decay when dissonant
const REPRO_THRESHOLD = 0.78;  // health level needed to reproduce
const REPRO_CHANCE = 0.003;    // per-step reproduction probability
const DEATH_THRESHOLD = 0.04;  // health floor before death
const PITCH_STEP_CENTS = 15;   // Gaussian std dev for pitch moves

/**
 * Step the simulation forward by dt seconds.
 * Returns organisms that died this step (for audio cleanup).
 */
export function stepSim(state: SimState, dt: number): Organism[] {
  const { organisms } = state;
  const living = organisms.filter((o) => o.alive);
  const dead: Organism[] = [];

  // 1. Pitch foraging — each organism proposes a small move
  for (const org of living) {
    // Skip very new organisms (let them settle)
    if (org.age < 0.5) continue;

    const currentFit =
      computeFitness(org.freq, living, org.id).fitness -
      crowdingPenalty(org.freq, living, org.id);

    // Gaussian step in cents
    const cents = gaussRandom() * PITCH_STEP_CENTS;
    const candidateFreq = org.freq * Math.pow(2, cents / 1200);

    // Clamp to range
    if (candidateFreq < FREQ_MIN || candidateFreq > FREQ_MAX) continue;

    const candidateFit =
      computeFitness(candidateFreq, living, org.id).fitness -
      crowdingPenalty(candidateFreq, living, org.id);

    // Greedy accept or Metropolis
    const delta = candidateFit - currentFit;
    if (delta > 0 || Math.random() < Math.exp(delta / METROPOLIS_TEMP)) {
      org.freq = candidateFreq;
    }
  }

  // 2. Recompute consonance & update health
  for (const org of living) {
    const { fitness, roughness, bonus } = computeFitness(org.freq, living, org.id);
    org.consonance = fitness;

    // Health dynamics
    const consonanceScore = fitness;
    const healthDelta = HEALTH_GAIN_K * consonanceScore - HEALTH_COST;
    org.health += healthDelta * dt;

    // Extra roughness penalty
    if (roughness > 0.3) {
      org.health -= HEALTH_DECAY * roughness * dt;
    }

    // Extra harmony reward
    if (bonus > 0.5) {
      org.health += 0.01 * bonus * dt;
    }

    org.health = Math.max(0, Math.min(1, org.health));
    org.age += dt;
  }

  // 3. Death
  for (const org of living) {
    // Only allow death after a short protected period
    if (org.age > 2 && org.health < DEATH_THRESHOLD) {
      org.alive = false;
      dead.push(org);
    }
  }

  // 4. Reproduction
  const stillLiving = organisms.filter((o) => o.alive);
  if (stillLiving.length < POP_MAX) {
    for (const org of stillLiving) {
      if (
        org.health > REPRO_THRESHOLD &&
        Math.random() < REPRO_CHANCE
      ) {
        // Seed near parent in freq space
        const offsetCents = (Math.random() - 0.5) * 400; // ±200 cents
        const childFreq = clamp(
          org.freq * Math.pow(2, offsetCents / 1200),
          FREQ_MIN,
          FREQ_MAX,
        );
        const child = createOrganism(childFreq);
        child.health = 0.25;
        child.omega = org.omega * (0.9 + Math.random() * 0.2);
        organisms.push(child);
      }
    }
  }

  // 5. Re-seed if population crashes
  if (stillLiving.filter((o) => o.alive).length < POP_MIN) {
    for (let i = 0; i < 4; i++) {
      organisms.push(createOrganism());
    }
  }

  // 6. Kuramoto phase update
  const K = 1.2; // coupling strength
  for (const org of living) {
    if (!org.alive) continue;
    // Find consonant neighbors (consonance > threshold)
    let meanSin = 0;
    let count = 0;
    for (const other of living) {
      if (other.id === org.id || !other.alive) continue;
      if (org.consonance > 0.1) {
        meanSin += Math.sin(other.phase - org.phase);
        count++;
      }
    }
    const coupling = count > 0 ? K * meanSin / count : 0;
    org.phase += (org.omega + coupling) * dt;
    if (org.phase > Math.PI * 2) org.phase -= Math.PI * 2;
  }

  // 7. Remove dead from array (keep size manageable)
  // Prune truly dead organisms that have been gone long
  while (organisms.length > POP_MAX + 10) {
    const idx = organisms.findIndex((o) => !o.alive);
    if (idx >= 0) organisms.splice(idx, 1);
    else break;
  }

  // 8. Update mean consonance
  const totalC = stillLiving.reduce((s, o) => s + o.consonance, 0);
  state.meanConsonance = stillLiving.length > 0 ? totalC / stillLiving.length : 0;
  state.elapsed += dt;

  return dead;
}

// ── Audio ──────────────────────────────────────────────────────────────────────

/**
 * Build a short impulse response for a soft reverb (tail ~1.5s).
 */
export function buildReverbIR(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * 1.5);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-4.5 * i / len);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

/**
 * Attach Web Audio nodes to an organism. Call inside a user gesture.
 */
export function attachAudio(
  org: Organism,
  ctx: AudioContext,
  masterGain: GainNode,
): void {
  if (org.oscs) return; // already attached
  const oscs: OscillatorNode[] = [];
  const mergerGain = ctx.createGain();

  // Additive partials
  for (let n = 1; n <= N_HARMONICS; n++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = org.freq * n;
    const partialGain = ctx.createGain();
    partialGain.gain.value = (1 / n) * 0.18; // soft
    osc.connect(partialGain).connect(mergerGain);
    osc.start();
    oscs.push(osc);
  }

  // Tremolo gain (driven by Kuramoto phase externally)
  const tremGain = ctx.createGain();
  tremGain.gain.value = 1.0;

  // Voice gain (scaled by health)
  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;

  mergerGain.connect(tremGain).connect(gainNode).connect(masterGain);

  org.oscs = oscs;
  org.gainNode = gainNode;
  org.tremGain = tremGain;
}

/**
 * Update audio parameters for a living organism each rAF tick.
 * Called from the component's animation loop.
 */
export function updateAudio(
  org: Organism,
  ctx: AudioContext,
): void {
  if (!org.oscs || !org.gainNode || !org.tremGain) return;
  if (ctx.state === "closed") return;

  const now = ctx.currentTime;
  const TAU = 0.12; // glide time constant

  // Frequency glide for each partial
  for (let n = 0; n < org.oscs.length; n++) {
    const targetFreq = org.freq * (n + 1);
    org.oscs[n].frequency.setTargetAtTime(targetFreq, now, TAU);
  }

  // Gain proportional to health (volume breathes with Kuramoto phase)
  const tremolo = 0.75 + 0.25 * Math.sin(org.phase);
  const targetGain = org.alive ? org.health * 0.5 * tremolo : 0;
  org.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
}

/**
 * Detach and stop audio nodes for a dying organism.
 */
export function detachAudio(org: Organism, ctx: AudioContext): void {
  if (!org.oscs) return;
  const now = ctx.currentTime;
  try {
    if (org.gainNode) {
      org.gainNode.gain.setTargetAtTime(0, now, 0.15);
    }
    const oscs = org.oscs;
    setTimeout(() => {
      for (const osc of oscs) {
        try { osc.stop(); } catch { /* already stopped */ }
        try { osc.disconnect(); } catch { /* already disconnected */ }
      }
      try { org.gainNode?.disconnect(); } catch { /* ok */ }
      try { org.tremGain?.disconnect(); } catch { /* ok */ }
    }, 600);
  } catch { /* ignore */ }
  org.oscs = null;
  org.gainNode = null;
  org.tremGain = null;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function gaussRandom(): number {
  // Box–Muller
  const u = Math.random() || 1e-10;
  const v = Math.random() || 1e-10;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
