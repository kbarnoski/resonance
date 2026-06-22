/*
 * 847 · FEEDBACK ECOLOGY II — audio engine
 *
 * Copied wholesale from prototype 820 (`820-feedback-ecology`) per the
 * cycle-2 brief: REUSE 820's ear-safe Web Audio engine rather than import
 * across prototype folders. All ear-safety is preserved verbatim:
 *   - DynamicsCompressor brick-wall limiter before master (threshold −8, ratio 20)
 *   - MAX_FB_GAIN = 0.88, MAX_COUPLING = 0.35 hard clamps
 *   - master gain default 0.25
 *   - clamped setTargetAtTime setters
 *   - AudioContext only created on explicit user gesture (caller's job)
 *
 * The ONLY structural addition for cycle-2 is `applyCouplingWeights`, a
 * per-edge variant of `applyCoupling` that lets the self-evolving topology
 * (Lorenz drift + Hebbian edges) push individual, already-clamped edge
 * weights — it still routes through MAX_COUPLING so it can never exceed the
 * inherited safety ceiling.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResonatorNode {
  id: number;
  freq: number; // Hz
  q: number; // filter Q
  x: number; // layout position [0,1]
  y: number;
  hue: number; // color hue (degrees)
  energy: number; // running envelope for visualizer [0,1]
}

export interface Edge {
  from: number;
  to: number;
  weight: number; // [0,1] base coupling weight (static graph weight)
}

export interface AudioNodes {
  ctx: AudioContext;
  filters: BiquadFilterNode[];
  delays: DelayNode[];
  feedbackGains: GainNode[];
  outputGains: GainNode[];
  analysers: AnalyserNode[];
  couplingGains: (GainNode | null)[][]; // couplingGains[from][to]
  impulseGains: GainNode[];
  masterGain: GainNode;
  limiter: DynamicsCompressorNode;
}

// ── Scale presets (just-intonation ratios on a fundamental) ─────────────────

export const ROOT_HZ = 55; // A1 — low fundamental keeps system thumpy

export const SCALE_PRESETS: Record<string, number[]> = {
  // Just-intonation overtone series (partials 1–9 on A1)
  overtone: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ROOT_HZ * n),
  // Subharmonic / utonal – feel different from overtone
  subharmonic: [1, 2, 3, 4, 6, 8, 12].map((n) => (ROOT_HZ * 12) / n),
  // Cluster (tight ratios near unison — maximal beating/interference)
  cluster: [1.0, 1.04, 1.09, 1.14, 1.19, 1.26, 1.33, 1.41, 1.5].map(
    (r) => ROOT_HZ * 4 * r
  ),
};

// Number of resonator nodes in the network
export const NODE_COUNT = 8;

// Small-world graph adjacency weights: ring backbone + some cross-links
export function buildEdges(): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const next = (i + 1) % NODE_COUNT;
    edges.push({ from: i, to: next, weight: 0.7 });
    edges.push({ from: next, to: i, weight: 0.7 });
  }
  const shortcuts: [number, number][] = [
    [0, 3],
    [1, 5],
    [2, 6],
    [3, 7],
    [4, 0],
    [5, 2],
    [6, 1],
    [7, 4],
  ];
  for (const [a, b] of shortcuts) {
    edges.push({ from: a, to: b, weight: 0.4 });
    edges.push({ from: b, to: a, weight: 0.4 });
  }
  return edges;
}

// ── Circular node layout ─────────────────────────────────────────────────────

export function buildNodes(freqs: number[]): ResonatorNode[] {
  const hues = [260, 200, 160, 300, 30, 180, 330, 80];
  return freqs.map((freq, i) => {
    const angle = (i / NODE_COUNT) * Math.PI * 2 - Math.PI / 2;
    return {
      id: i,
      freq,
      q: 28 + Math.random() * 20,
      x: 0.5 + 0.38 * Math.cos(angle),
      y: 0.5 + 0.38 * Math.sin(angle),
      hue: hues[i % hues.length],
      energy: 0,
    };
  });
}

// ── Audio engine ─────────────────────────────────────────────────────────────

export function buildAudioEngine(freqs: number[], edges: Edge[]): AudioNodes {
  const ctx = new AudioContext();

  // Brick-wall limiter → master
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.25;

  limiter.connect(masterGain);
  masterGain.connect(ctx.destination);

  const filters: BiquadFilterNode[] = [];
  const delays: DelayNode[] = [];
  const feedbackGains: GainNode[] = [];
  const outputGains: GainNode[] = [];
  const analysers: AnalyserNode[] = [];
  const impulseGains: GainNode[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freqs[i];
    f.Q.value = 28;

    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = Math.min(0.5, 1 / freqs[i]);

    const fbGain = ctx.createGain();
    fbGain.gain.value = 0.0;

    const outGain = ctx.createGain();
    outGain.gain.value = 0.55;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    const impulse = ctx.createGain();
    impulse.gain.value = 1;

    // impulse → filter → delay → feedbackGain → (back to filter)
    //                                 → outputGain → analyser → limiter
    impulse.connect(f);
    f.connect(delay);
    delay.connect(fbGain);
    fbGain.connect(f);
    f.connect(outGain);
    outGain.connect(analyser);
    analyser.connect(limiter);

    filters.push(f);
    delays.push(delay);
    feedbackGains.push(fbGain);
    outputGains.push(outGain);
    analysers.push(analyser);
    impulseGains.push(impulse);
  }

  const couplingGains: (GainNode | null)[][] = Array.from(
    { length: NODE_COUNT },
    () => Array<GainNode | null>(NODE_COUNT).fill(null)
  );

  for (const edge of edges) {
    const g = ctx.createGain();
    g.gain.value = 0;
    filters[edge.from].connect(g);
    g.connect(filters[edge.to]);
    couplingGains[edge.from][edge.to] = g;
  }

  return {
    ctx,
    filters,
    delays,
    feedbackGains,
    outputGains,
    analysers,
    couplingGains,
    impulseGains,
    masterGain,
    limiter,
  };
}

// ── Ear-safety clamped setters ───────────────────────────────────────────────

export const MAX_FB_GAIN = 0.88;
export const MAX_COUPLING = 0.35;

export function applyFeedbackGain(audio: AudioNodes, selfFb: number): void {
  const clamped = Math.min(selfFb, MAX_FB_GAIN);
  for (const g of audio.feedbackGains) {
    g.gain.setTargetAtTime(clamped, audio.ctx.currentTime, 0.05);
  }
}

export function applyCoupling(
  audio: AudioNodes,
  edges: Edge[],
  coupling: number
): void {
  const clamped = Math.min(coupling, MAX_COUPLING);
  for (const edge of edges) {
    const g = audio.couplingGains[edge.from]?.[edge.to];
    if (g) {
      g.gain.setTargetAtTime(clamped * edge.weight, audio.ctx.currentTime, 0.08);
    }
  }
}

/**
 * Cycle-2 addition: drive each edge's coupling gain from a per-edge live
 * weight (Hebbian × Lorenz drift). `globalCoupling` is the Lorenz-driven x
 * channel; `liveWeights[i]` is the evolving weight for `edges[i]`. The product
 * still passes through MAX_COUPLING so per-edge values can never exceed the
 * inherited safety ceiling. A short setTargetAtTime keeps it click-free.
 */
export function applyCouplingWeights(
  audio: AudioNodes,
  edges: Edge[],
  liveWeights: Float32Array,
  globalCoupling: number
): void {
  const clampedGlobal = Math.min(Math.max(globalCoupling, 0), MAX_COUPLING);
  const now = audio.ctx.currentTime;
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    const g = audio.couplingGains[edge.from]?.[edge.to];
    if (!g) continue;
    const w = liveWeights[e];
    // edge.weight = static topology weight; w = live Hebbian weight [0,1]
    const target = clampedGlobal * edge.weight * w;
    g.gain.setTargetAtTime(Math.min(target, MAX_COUPLING), now, 0.12);
  }
}

export function applyMasterVolume(audio: AudioNodes, vol: number): void {
  audio.masterGain.gain.setTargetAtTime(vol, audio.ctx.currentTime, 0.05);
}

export function applyMute(audio: AudioNodes): void {
  audio.masterGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.01);
}

/**
 * Cycle-2 addition: gentle global Q + detune modulation, driven by the Lorenz
 * z channel (the "slow timbral/register" weather). Q is clamped to a musical
 * window; detune is a few cents so it never destabilises the resonators.
 */
export function applyTimbre(
  audio: AudioNodes,
  freqs: number[],
  qScale: number,
  detuneCents: number
): void {
  const now = audio.ctx.currentTime;
  const q = Math.min(Math.max(18 + qScale * 28, 12), 52);
  for (let i = 0; i < audio.filters.length; i++) {
    audio.filters[i].Q.setTargetAtTime(q, now, 0.4);
    const detuned = freqs[i] * Math.pow(2, detuneCents / 1200);
    audio.filters[i].frequency.setTargetAtTime(detuned, now, 0.5);
  }
}

// Fire a short noise burst into node i — kicks the dynamical system
export function injectImpulse(audio: AudioNodes, nodeIdx: number): void {
  const ctx = audio.ctx;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let k = 0; k < data.length; k++) {
    data[k] = (Math.random() * 2 - 1) * 0.6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(audio.impulseGains[nodeIdx]);
  src.start();
}

// Read RMS energy from analyser (0→1)
export function readEnergy(
  analyser: AnalyserNode,
  buf: Uint8Array<ArrayBuffer>
): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = (buf[i] - 128) / 128;
    sum += s * s;
  }
  return Math.sqrt(sum / buf.length);
}
