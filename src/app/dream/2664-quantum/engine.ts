// ════════════════════════════════════════════════════════════════════════════
// 2664 · Quantum Whispers — the cooperative wavefunction ensemble.
//
// A deterministic, quantum-INSPIRED agent system (no quantum lib, no ML, no net).
// Each agent holds a probability distribution over a 12-TET pitch grid. Every
// frame the distribution evolves; on each downbeat the agent SAMPLES (collapses)
// one pitch to actually play, then TELEPORTS a noisy copy of its distribution to
// a neighbour — the transfer noise is the expressive "quantum whisper". A single
// DIVERGENCE knob sets the continuum from imitation (track the player) to
// divergence (wander into the agent's own attractor). See README / arXiv:2607.19212.
// ════════════════════════════════════════════════════════════════════════════

export const N_AGENTS = 3;
export const N_BINS = 25; // pitch bins across ~2 octaves
export const MIDI_LO = 52; // E3 — lowest agent bin

// Seeded PRNG — mulberry32. All randomness in this file flows from one stream so
// the ghost self-demo and every collapse are byte-for-byte reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export type Thread = { from: number; to: number; t: number };

export type Agent = {
  index: number;
  prob: Float32Array; // distribution over pitch bins, sums to 1
  attractor: Float32Array; // agent's own preferred distribution (seeded)
  phase: Float32Array; // per-bin shimmer phase (visual only)
  phaseSpeed: Float32Array;
  cx: number; // screen centre, clip space (y up)
  cy: number;
  hue: number; // 0..1 offset along the violet→magenta ramp
  collapsedBin: number;
  collapseTime: number; // performance.now() of last collapse
  collapseFreq: number;
};

type Callbacks = {
  playAgent: (agentIndex: number, freq: number, vel: number, delay: number) => void;
  playGhost: (freq: number, vel: number, delay: number) => void;
};

const BPM = 96;
const BEAT_MS = (60 / BPM) * 1000;
const USER_DECAY_MS = 2600; // recent-note memory half-life-ish
const FOLLOW_RATE = 2.4; // per-second pull of prob toward its target
const GHOST_IDLE_MS = 4000;

// A short seeded motif (bin offsets) the ghost plays when nobody is jamming.
const GHOST_MOTIF = [12, 14, 15, 12, 17, 15, 14, 10];

function normalize(p: Float32Array): void {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i];
  if (s <= 1e-9) {
    p.fill(1 / p.length);
    return;
  }
  const inv = 1 / s;
  for (let i = 0; i < p.length; i++) p[i] *= inv;
}

function gaussianBump(p: Float32Array, centre: number, width: number, amp: number): void {
  for (let i = 0; i < p.length; i++) {
    const d = i - centre;
    p[i] += amp * Math.exp(-(d * d) / (2 * width * width));
  }
}

export class QuantumEngine {
  agents: Agent[] = [];
  threads: Thread[] = [];
  userDist: Float32Array; // recent notes the player (or ghost) actually sounded
  divergence = 0.35;
  private rng: () => number;
  private cb: Callbacks;
  private lastBeat = 0;
  private lastFrame = 0;
  private beatCount = 0;
  private lastInputTime = 0;
  private ghostStep = 0;

  constructor(cb: Callbacks, seed = 0x2664) {
    this.cb = cb;
    this.rng = mulberry32(seed);
    this.userDist = new Float32Array(N_BINS);
    this.userDist.fill(1 / N_BINS);

    const centres: [number, number][] = [
      [0.0, 0.44],
      [-0.56, -0.34],
      [0.56, -0.34],
    ];
    for (let a = 0; a < N_AGENTS; a++) {
      const attractor = new Float32Array(N_BINS);
      // 1–2 seeded attractor peaks per agent → high divergence clashes on purpose.
      const peaks = 1 + Math.floor(this.rng() * 2);
      for (let k = 0; k < peaks; k++) {
        gaussianBump(
          attractor,
          Math.floor(this.rng() * N_BINS),
          1.2 + this.rng() * 1.6,
          0.6 + this.rng() * 0.4,
        );
      }
      normalize(attractor);
      const prob = new Float32Array(N_BINS);
      prob.set(attractor);
      const phase = new Float32Array(N_BINS);
      const phaseSpeed = new Float32Array(N_BINS);
      for (let i = 0; i < N_BINS; i++) {
        phase[i] = this.rng() * Math.PI * 2;
        phaseSpeed[i] = 0.6 + this.rng() * 1.4;
      }
      this.agents.push({
        index: a,
        prob,
        attractor,
        phase,
        phaseSpeed,
        cx: centres[a][0],
        cy: centres[a][1],
        hue: a / (N_AGENTS - 1),
        collapsedBin: -1,
        collapseTime: -1e9,
        collapseFreq: 0,
      });
    }
  }

  setDivergence(v: number): void {
    this.divergence = clamp(v, 0, 1);
  }

  // Player (or ghost) sounded a pitch → fold it into the recent-note memory.
  registerUserNote(midi: number, now: number, markInput: boolean): void {
    const bin = clamp(Math.round(midi - MIDI_LO), 0, N_BINS - 1);
    gaussianBump(this.userDist, bin, 0.9, 0.8);
    normalize(this.userDist);
    if (markInput) this.lastInputTime = now;
  }

  ghostActive(now: number): boolean {
    return now - this.lastInputTime > GHOST_IDLE_MS;
  }

  // Advance the whole ensemble. Called once per animation frame.
  update(now: number): void {
    if (this.lastFrame === 0) {
      this.lastFrame = now;
      this.lastBeat = now;
      this.lastInputTime = now - GHOST_IDLE_MS - 1; // ghost greets immediately
    }
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-away

    // Decay the recent-note memory toward flat.
    const keep = Math.exp((-dt * 1000) / USER_DECAY_MS);
    for (let i = 0; i < N_BINS; i++) {
      this.userDist[i] = this.userDist[i] * keep + (1 - keep) / N_BINS;
    }

    const div = this.divergence;
    const follow = 1 - Math.exp(-FOLLOW_RATE * dt);
    for (const ag of this.agents) {
      for (let i = 0; i < N_BINS; i++) {
        ag.phase[i] += ag.phaseSpeed[i] * dt;
        const shimmer = 0.5 + 0.5 * Math.sin(ag.phase[i]);
        // target = blend of imitation (userDist) and divergence (own attractor),
        // lightly modulated by shimmer so the cloud is never frozen.
        const target =
          (1 - div) * this.userDist[i] +
          div * ag.attractor[i] * (0.6 + 0.8 * shimmer);
        ag.prob[i] += (target - ag.prob[i]) * follow;
        if (ag.prob[i] < 0) ag.prob[i] = 0;
      }
      normalize(ag.prob);
    }

    // Age out spent teleport threads.
    if (this.threads.length) {
      this.threads = this.threads.filter((t) => now - t.t < 260);
    }

    // Beat clock — resync if we fell far behind (tab hidden).
    if (now - this.lastBeat > 4 * BEAT_MS) this.lastBeat = now;
    while (now - this.lastBeat >= BEAT_MS) {
      this.lastBeat += BEAT_MS;
      this.onBeat(now);
    }
  }

  private sampleBin(p: Float32Array): number {
    const r = this.rng();
    let acc = 0;
    for (let i = 0; i < p.length; i++) {
      acc += p[i];
      if (r <= acc) return i;
    }
    return p.length - 1;
  }

  private onBeat(now: number): void {
    const div = this.divergence;

    // Self-demo: with no player, the ghost feeds a seeded motif into the shared
    // memory AND sounds a soft lead so the collapse/teleport cycle is audible.
    if (this.ghostActive(now)) {
      const bin = GHOST_MOTIF[this.ghostStep % GHOST_MOTIF.length];
      this.ghostStep++;
      const midi = MIDI_LO + bin;
      this.registerUserNote(midi, now, false);
      this.cb.playGhost(midiToFreq(midi), 0.5, 0);
    }

    // Every agent collapses this beat; each teleports to its neighbour.
    for (let a = 0; a < N_AGENTS; a++) {
      const ag = this.agents[a];
      const bin = this.sampleBin(ag.prob);
      // Continuous microtonal detune — grows with divergence → real dissonance.
      const cents = (this.rng() * 2 - 1) * div * 55;
      const freq = midiToFreq(MIDI_LO + bin + cents / 100);
      const vel = clamp(0.3 + 2.4 * ag.prob[bin], 0.3, 1);
      ag.collapsedBin = bin;
      ag.collapseTime = now;
      ag.collapseFreq = freq;
      // stagger voices so three simultaneous collapses don't smear into mud
      this.cb.playAgent(a, freq, vel, a * 0.085);

      // Teleport a NOISY copy of this agent's state to the next agent.
      const nb = this.agents[(a + 1) % N_AGENTS];
      const noiseAmt = 0.12 + div * 0.55;
      const teleport = 0.28 + div * 0.22;
      for (let i = 0; i < N_BINS; i++) {
        const noisy = ag.prob[i] * (1 + (this.rng() * 2 - 1) * noiseAmt);
        nb.prob[i] += (Math.max(0, noisy) - nb.prob[i]) * teleport;
        if (nb.prob[i] < 0) nb.prob[i] = 0;
      }
      normalize(nb.prob);
      this.threads.push({ from: a, to: (a + 1) % N_AGENTS, t: now });
    }
    this.beatCount++;
  }
}
