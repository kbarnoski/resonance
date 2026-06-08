/**
 * Conchordal Listen — Simulation + Audio Engine (Cycle 3)
 *
 * Extends 410-conchordal-garden with a "listen" subsystem:
 *  - Heard partials extracted from Web Audio AnalyserNode (FFT peaks + autocorr)
 *  - Organisms forage around heard partials as attractor wells
 *  - Plomp–Levelt roughness computed against BOTH heard spectrum and other organisms
 *  - Harmonicity bonus to the strongest heard partial drives JI convergence
 *  - Metropolis acceptance for continuous microtonal pitch search
 *  - Kuramoto phase coupling across mutually-consonant voices
 *  - Additive synthesis → reverb → brick-wall DynamicsCompressor
 *
 * References:
 *  - Plomp & Levelt 1965 (roughness model)
 *  - McLeod Pitch Method (autocorrelation lag detection)
 *  - PMC11534602 (consonance ↔ phase sync, 2024)
 *  - Conchordal arXiv:2603.25637
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const FREQ_MIN = 130;   // Hz (C3)
export const FREQ_MAX = 880;   // Hz (~A5)
export const N_HARMONICS = 5;  // partials per voice
export const POP_INIT = 28;
export const POP_MAX = 40;
export const POP_MIN = 8;
export const SIM_HZ = 20;

// Small-integer JI ratios to reward
const JI_RATIOS = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2 / 1];

// Plomp–Levelt curve params (from brief spec)
const PL_A = 0.24;
const PL_B = 0.0207;
const PL_C = 18.96;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HeardPartial {
  freq: number;
  amp: number;  // 0..1 normalised
}

export interface Organism {
  id: number;
  freq: number;
  health: number;
  phase: number;      // Kuramoto θ
  omega: number;      // Kuramoto natural ω (rad/s)
  consonance: number; // last computed fitness
  age: number;
  alive: boolean;
  oscs: OscillatorNode[] | null;
  gainNode: GainNode | null;
  tremGain: GainNode | null;
}

export interface SimState {
  organisms: Organism[];
  time: number;
  elapsed: number;
  meanConsonance: number;
  heardPartials: HeardPartial[];
}

// ── Roughness model ────────────────────────────────────────────────────────────

/**
 * Plomp–Levelt roughness between two partials.
 * Exact formula from brief: s = 0.24/(0.0207*min(f1,f2)+18.96);
 * x = |f2-f1|; rough = a1*a2*(exp(-3.5*s*x) - exp(-5.75*s*x))
 */
export function plRoughness(f1: number, a1: number, f2: number, a2: number): number {
  const fmin = Math.min(f1, f2);
  const s = PL_A / (PL_B * fmin + PL_C);
  const x = Math.abs(f2 - f1);
  return a1 * a2 * (Math.exp(-3.5 * s * x) - Math.exp(-5.75 * s * x));
}

function harmonicityBonus(fA: number, fB: number): number {
  const r = fA > fB ? fA / fB : fB / fA;
  let best = Infinity;
  for (const ji of JI_RATIOS) {
    const d1 = Math.abs(r - ji);
    if (d1 < best) best = d1;
    const d2 = Math.abs(r / 2 - ji);
    if (d2 < best) best = d2;
    const d3 = Math.abs(r * 2 - ji);
    if (d3 < best) best = d3;
  }
  // Tolerance ~50 cents
  return Math.max(0, 1 - best / 0.06);
}

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
 * Compute fitness of a candidate freq against:
 *  (a) heard partials (from mic / demo / recording)
 *  (b) other organisms' partials
 * Returns { roughness, bonus, fitness }
 */
export function computeFitness(
  candidateFreq: number,
  others: Organism[],
  excludeId: number,
  heard: HeardPartial[],
): { roughness: number; bonus: number; fitness: number } {
  const { f: cf, a: ca } = getPartials(candidateFreq);
  let totalRoughness = 0;
  let totalBonus = 0;
  let pairCount = 0;

  // Against other organisms
  for (const o of others) {
    if (o.id === excludeId || !o.alive) continue;
    const { f: of_, a: oa } = getPartials(o.freq);
    for (let i = 0; i < cf.length; i++) {
      for (let j = 0; j < of_.length; j++) {
        if (cf[i] > 8000 || of_[j] > 8000) continue;
        totalRoughness += plRoughness(cf[i], ca[i], of_[j], oa[j]);
        pairCount++;
      }
    }
    totalBonus += harmonicityBonus(candidateFreq, o.freq);
  }

  // Against heard partials (weighted more strongly to drive convergence)
  for (const hp of heard) {
    if (hp.freq < 20 || hp.freq > 8000) continue;
    for (let i = 0; i < cf.length; i++) {
      totalRoughness += plRoughness(cf[i], ca[i], hp.freq, hp.amp) * 1.5;
      pairCount++;
    }
    // Strong bonus toward heard partials
    totalBonus += harmonicityBonus(candidateFreq, hp.freq) * 2.0;
  }

  const n = Math.max(1, pairCount);
  totalRoughness /= n;

  const liveCount = Math.max(1, others.filter((o) => o.id !== excludeId && o.alive).length + heard.length);
  totalBonus /= liveCount;

  return {
    roughness: totalRoughness,
    bonus: totalBonus,
    fitness: -totalRoughness + totalBonus * 0.5,
  };
}

function crowdingPenalty(freq: number, others: Organism[], excludeId: number): number {
  const LOG_MIN_DIST = Math.log2(1.02); // ~35 cents
  let penalty = 0;
  for (const o of others) {
    if (o.id === excludeId || !o.alive) continue;
    const dist = Math.abs(Math.log2(freq / o.freq));
    if (dist < LOG_MIN_DIST) {
      penalty += ((LOG_MIN_DIST - dist) / LOG_MIN_DIST) * 0.5;
    }
  }
  return penalty;
}

// ── Attraction toward heard wells ──────────────────────────────────────────────

/**
 * Compute attraction bonus toward the nearest heard partial.
 * Organisms are gently pulled to forage near heard pitches.
 */
function heardAttractionBonus(freq: number, heard: HeardPartial[]): number {
  if (heard.length === 0) return 0;
  let best = 0;
  for (const hp of heard) {
    if (hp.freq < 20) continue;
    // Distance in semitones (log2 space)
    const semitones = Math.abs(Math.log2(freq / hp.freq)) * 12;
    // Gaussian well: sigma ~3 semitones, amplitude = hp.amp
    const attraction = hp.amp * Math.exp(-(semitones * semitones) / 18);
    if (attraction > best) best = attraction;
    // Also reward landing near JI harmonic multiples of heard
    for (const ji of [2, 3 / 2, 4 / 3, 5 / 4, 5 / 3]) {
      const jiFreq = hp.freq * ji;
      if (jiFreq > FREQ_MIN && jiFreq < FREQ_MAX) {
        const d2 = Math.abs(Math.log2(freq / jiFreq)) * 12;
        const att2 = hp.amp * 0.7 * Math.exp(-(d2 * d2) / 9);
        if (att2 > best) best = att2;
      }
    }
  }
  return best * 0.4;
}

// ── Organism factory ───────────────────────────────────────────────────────────

let _nextId = 0;

export function createOrganism(freq?: number): Organism {
  const f = freq ?? FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, Math.random());
  return {
    id: _nextId++,
    freq: f,
    health: 0.2 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    omega: (0.1 + Math.random() * 0.3) * 2 * Math.PI,
    consonance: 0,
    age: 0,
    alive: true,
    oscs: null,
    gainNode: null,
    tremGain: null,
  };
}

// ── Simulation step ────────────────────────────────────────────────────────────

const METROPOLIS_TEMP_INIT = 0.12;
const METROPOLIS_COOL = 0.9998;      // slow cooling → exploration
const HEALTH_COST = 0.012;
const HEALTH_GAIN_K = 0.28;
const HEALTH_DECAY = 0.007;
const REPRO_THRESHOLD = 0.8;
const REPRO_CHANCE = 0.003;
const DEATH_THRESHOLD = 0.035;
const PITCH_STEP_CENTS = 18;

let _temperature = METROPOLIS_TEMP_INIT;

export function resetTemperature(): void {
  _temperature = METROPOLIS_TEMP_INIT;
}

export function stepSim(state: SimState, dt: number): Organism[] {
  const { organisms, heardPartials } = state;
  const living = organisms.filter((o) => o.alive);
  const dead: Organism[] = [];

  // Cool temperature
  _temperature *= Math.pow(METROPOLIS_COOL, dt * SIM_HZ);
  const T = Math.max(0.02, _temperature);

  // 1. Pitch foraging
  for (const org of living) {
    if (org.age < 0.5) continue;

    const currentFit =
      computeFitness(org.freq, living, org.id, heardPartials).fitness
      - crowdingPenalty(org.freq, living, org.id)
      + heardAttractionBonus(org.freq, heardPartials);

    const cents = gaussRandom() * PITCH_STEP_CENTS;
    const candidateFreq = org.freq * Math.pow(2, cents / 1200);
    if (candidateFreq < FREQ_MIN || candidateFreq > FREQ_MAX) continue;

    const candidateFit =
      computeFitness(candidateFreq, living, org.id, heardPartials).fitness
      - crowdingPenalty(candidateFreq, living, org.id)
      + heardAttractionBonus(candidateFreq, heardPartials);

    const delta = candidateFit - currentFit;
    if (delta > 0 || Math.random() < Math.exp(delta / T)) {
      org.freq = candidateFreq;
    }
  }

  // 2. Recompute consonance & health
  for (const org of living) {
    const { fitness, roughness, bonus } = computeFitness(org.freq, living, org.id, heardPartials);
    org.consonance = fitness;

    const healthDelta = HEALTH_GAIN_K * fitness - HEALTH_COST;
    org.health += healthDelta * dt;
    if (roughness > 0.3) org.health -= HEALTH_DECAY * roughness * dt;
    if (bonus > 0.5) org.health += 0.008 * bonus * dt;
    org.health = clamp(org.health, 0, 1);
    org.age += dt;
  }

  // 3. Death
  for (const org of living) {
    if (org.age > 2 && org.health < DEATH_THRESHOLD) {
      org.alive = false;
      dead.push(org);
    }
  }

  // 4. Reproduction / re-seed near heard partials
  const stillLiving = organisms.filter((o) => o.alive);
  if (stillLiving.length < POP_MAX) {
    for (const org of stillLiving) {
      if (org.health > REPRO_THRESHOLD && Math.random() < REPRO_CHANCE) {
        const offsetCents = (Math.random() - 0.5) * 400;
        const childFreq = clamp(
          org.freq * Math.pow(2, offsetCents / 1200),
          FREQ_MIN, FREQ_MAX,
        );
        const child = createOrganism(childFreq);
        child.health = 0.25;
        child.omega = org.omega * (0.9 + Math.random() * 0.2);
        organisms.push(child);
      }
    }
  }

  // 5. Re-seed near heard partials when pop is low
  const aliveNow = organisms.filter((o) => o.alive);
  if (aliveNow.length < POP_MIN) {
    const seedCount = 4;
    for (let i = 0; i < seedCount; i++) {
      let seedFreq: number;
      if (heardPartials.length > 0 && Math.random() < 0.7) {
        // Seed near a random heard partial (with octave offset)
        const hp = heardPartials[Math.floor(Math.random() * heardPartials.length)];
        const octave = Math.pow(2, Math.floor(Math.random() * 3) - 1);
        seedFreq = clamp(hp.freq * octave * (0.9 + Math.random() * 0.2), FREQ_MIN, FREQ_MAX);
      } else {
        seedFreq = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, Math.random());
      }
      organisms.push(createOrganism(seedFreq));
    }
  }

  // 6. Kuramoto phase coupling
  const K = 1.5;
  for (const org of living) {
    if (!org.alive) continue;
    let meanSin = 0;
    let count = 0;
    for (const other of living) {
      if (other.id === org.id || !other.alive) continue;
      if (org.consonance > 0.08) {
        meanSin += Math.sin(other.phase - org.phase);
        count++;
      }
    }
    const coupling = count > 0 ? K * meanSin / count : 0;
    org.phase += (org.omega + coupling) * dt;
    if (org.phase > Math.PI * 2) org.phase -= Math.PI * 2;
  }

  // 7. Prune dead
  while (organisms.length > POP_MAX + 12) {
    const idx = organisms.findIndex((o) => !o.alive);
    if (idx >= 0) organisms.splice(idx, 1);
    else break;
  }

  // 8. Mean consonance
  const totalC = aliveNow.reduce((s, o) => s + o.consonance, 0);
  state.meanConsonance = aliveNow.length > 0 ? totalC / aliveNow.length : 0;
  state.elapsed += dt;

  return dead;
}

// ── Heard-partial extraction from AnalyserNode ─────────────────────────────────

/**
 * Extract top N spectral peaks from FFT data.
 * Returns { freq, amp } pairs, amplitude normalised 0..1.
 */
export function extractFftPeaks(
  analyser: AnalyserNode,
  buf: Float32Array<ArrayBuffer>,
  sampleRate: number,
  topN = 4,
): HeardPartial[] {
  analyser.getFloatFrequencyData(buf);
  const binHz = sampleRate / analyser.fftSize;
  const len = buf.length;

  // Find local maxima above -60 dBFS
  const peaks: Array<{ freq: number; dB: number }> = [];
  for (let i = 2; i < len - 2; i++) {
    const dB = buf[i];
    if (dB < -60) continue;
    if (dB > buf[i - 1] && dB > buf[i - 2] && dB > buf[i + 1] && dB > buf[i + 2]) {
      peaks.push({ freq: i * binHz, dB });
    }
  }

  // Sort descending by amplitude
  peaks.sort((a, b) => b.dB - a.dB);
  const selected = peaks.slice(0, topN);

  if (selected.length === 0) return [];

  // Normalise: strongest peak = 1
  const maxDB = selected[0].dB;
  return selected.map((p) => ({
    freq: p.freq,
    amp: Math.pow(10, (p.dB - maxDB) / 20), // linear relative
  }));
}

/**
 * Autocorrelation-based monophonic fundamental detection (MPM-style).
 * Operates on time-domain data from AnalyserNode (getFloatTimeDomainData).
 * Returns fundamental Hz or null if no clear pitch found.
 */
export function detectFundamental(
  analyser: AnalyserNode,
  timeBuf: Float32Array<ArrayBuffer>,
  sampleRate: number,
): number | null {
  analyser.getFloatTimeDomainData(timeBuf);
  const N = timeBuf.length;

  // Normalised square difference function (NSDF) — MPM core
  // Compute autocorrelation via sum
  const minLag = Math.floor(sampleRate / FREQ_MAX);
  const maxLag = Math.floor(sampleRate / FREQ_MIN);

  let bestLag = -1;
  let bestCorr = 0;

  // Simple autocorrelation (not full NSDF — sufficient for our purposes)
  for (let lag = minLag; lag <= Math.min(maxLag, N / 2); lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i < N - lag; i++) {
      corr += timeBuf[i] * timeBuf[i + lag];
      norm += timeBuf[i] * timeBuf[i] + timeBuf[i + lag] * timeBuf[i + lag];
    }
    const nsdf = norm > 0.001 ? 2 * corr / norm : 0;
    if (nsdf > bestCorr) {
      bestCorr = nsdf;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorr < 0.3) return null;

  // Parabolic interpolation for sub-sample accuracy
  const c0 = bestLag > 0 ? autocorrAt(timeBuf, N, bestLag - 1) : 0;
  const c1 = autocorrAt(timeBuf, N, bestLag);
  const c2 = bestLag < N / 2 ? autocorrAt(timeBuf, N, bestLag + 1) : 0;
  const denom = c0 - 2 * c1 + c2;
  const refinedLag = denom !== 0 ? bestLag - 0.5 * (c2 - c0) / denom : bestLag;

  return sampleRate / refinedLag;
}

function autocorrAt(buf: Float32Array, N: number, lag: number): number {
  let s = 0;
  for (let i = 0; i < N - lag; i++) s += buf[i] * buf[i + lag];
  return s;
}

// ── Demo synth: gentle arpeggiated piano-ish phrase ────────────────────────────

/**
 * Synthesize a calm, slowly arpeggiated phrase internally.
 * Uses additive sine synthesis with envelope shaping.
 * Routes through destNode (which feeds the same AnalyserNode as mic audio).
 * Returns a cleanup function.
 */
export function scheduleDemoPhrase(
  ctx: AudioContext,
  destNode: AudioNode,
): () => void {
  // A gentle progression: root – major third – fifth – octave – seventh
  // In pure JI: 1, 5/4, 3/2, 2/1, 7/4 relative to ~A3 (220 Hz)
  const baseFreq = 220; // A3
  const jiNotes = [
    1, 5 / 4, 3 / 2, 2 / 1,      // A – C#' – E' – A'
    5 / 4, 3 / 2, 7 / 4, 2 / 1,  // C#' – E' – G' – A'
    4 / 3, 1, 5 / 4, 3 / 2,       // D – A – C#' – E'
    3 / 2, 2 / 1, 5 / 4, 1,       // E' – A' – C#' – A
  ];
  const tempo = 1.1; // seconds per note
  const gain = ctx.createGain();
  gain.gain.value = 0.22;
  gain.connect(destNode);

  const nodes: AudioScheduledSourceNode[] = [];

  jiNotes.forEach((ratio, i) => {
    const freq = baseFreq * ratio;
    const startT = ctx.currentTime + 1 + i * tempo;
    const endT = startT + tempo * 0.85;

    // A few additive partials per note (piano-like: 1st bright, then decay)
    for (let h = 1; h <= 6; h++) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * h;
      const partialAmp = (1 / h) * (h <= 2 ? 0.18 : 0.08);
      env.gain.setValueAtTime(0, startT);
      env.gain.linearRampToValueAtTime(partialAmp, startT + 0.015);
      env.gain.exponentialRampToValueAtTime(partialAmp * 0.4, startT + 0.12);
      env.gain.exponentialRampToValueAtTime(0.0001, endT);
      osc.connect(env);
      env.connect(gain);
      osc.start(startT);
      osc.stop(endT + 0.05);
      nodes.push(osc);
    }
  });

  // Loop the phrase after the first pass completes
  let loopTimeout: ReturnType<typeof setTimeout> | null = null;
  const loopDelay = (jiNotes.length * tempo + 1.5) * 1000;
  let loopActive = true;

  function scheduleLoop() {
    if (!loopActive) return;
    loopTimeout = setTimeout(() => {
      if (!loopActive) return;
      try {
        jiNotes.forEach((ratio, i) => {
          const freq = baseFreq * ratio;
          const startT = ctx.currentTime + 0.2 + i * tempo;
          const endT = startT + tempo * 0.85;
          for (let h = 1; h <= 6; h++) {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq * h;
            const partialAmp = (1 / h) * (h <= 2 ? 0.18 : 0.08);
            env.gain.setValueAtTime(0, startT);
            env.gain.linearRampToValueAtTime(partialAmp, startT + 0.015);
            env.gain.exponentialRampToValueAtTime(partialAmp * 0.4, startT + 0.12);
            env.gain.exponentialRampToValueAtTime(0.0001, endT);
            osc.connect(env);
            env.connect(gain);
            osc.start(startT);
            osc.stop(endT + 0.05);
          }
        });
        scheduleLoop();
      } catch { /* ctx closed */ }
    }, loopDelay);
  }

  scheduleLoop();

  // Return stop/cleanup
  return () => {
    loopActive = false;
    if (loopTimeout) clearTimeout(loopTimeout);
    try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch { /* ok */ }
    setTimeout(() => {
      for (const n of nodes) { try { n.stop(); n.disconnect(); } catch { /* ok */ } }
      try { gain.disconnect(); } catch { /* ok */ }
    }, 200);
  };
}

// ── Reverb IR ─────────────────────────────────────────────────────────────────

export function buildReverbIR(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * 1.6);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-5 * i / len);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

// ── Organism audio ─────────────────────────────────────────────────────────────

export function attachAudio(org: Organism, ctx: AudioContext, masterGain: GainNode): void {
  if (org.oscs) return;
  const oscs: OscillatorNode[] = [];
  const mergerGain = ctx.createGain();

  for (let n = 1; n <= N_HARMONICS; n++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = org.freq * n;
    const pg = ctx.createGain();
    pg.gain.value = (1 / n) * 0.14;
    osc.connect(pg).connect(mergerGain);
    osc.start();
    oscs.push(osc);
  }

  const tremGain = ctx.createGain();
  tremGain.gain.value = 1.0;
  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;

  mergerGain.connect(tremGain).connect(gainNode).connect(masterGain);

  org.oscs = oscs;
  org.gainNode = gainNode;
  org.tremGain = tremGain;
}

export function updateAudio(org: Organism, ctx: AudioContext): void {
  if (!org.oscs || !org.gainNode || !org.tremGain) return;
  if (ctx.state === "closed") return;
  const now = ctx.currentTime;
  const TAU = 0.10;
  for (let n = 0; n < org.oscs.length; n++) {
    org.oscs[n].frequency.setTargetAtTime(org.freq * (n + 1), now, TAU);
  }
  const tremolo = 0.72 + 0.28 * Math.sin(org.phase);
  const targetGain = org.alive ? org.health * 0.45 * tremolo : 0;
  org.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
}

export function detachAudio(org: Organism, ctx: AudioContext): void {
  if (!org.oscs) return;
  const now = ctx.currentTime;
  try {
    if (org.gainNode) org.gainNode.gain.setTargetAtTime(0, now, 0.12);
    const oscs = org.oscs;
    setTimeout(() => {
      for (const osc of oscs) {
        try { osc.stop(); } catch { /* ok */ }
        try { osc.disconnect(); } catch { /* ok */ }
      }
      try { org.gainNode?.disconnect(); } catch { /* ok */ }
      try { org.tremGain?.disconnect(); } catch { /* ok */ }
    }, 500);
  } catch { /* ignore */ }
  org.oscs = null;
  org.gainNode = null;
  org.tremGain = null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function gaussRandom(): number {
  const u = Math.random() || 1e-10;
  const v = Math.random() || 1e-10;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export { clamp };
