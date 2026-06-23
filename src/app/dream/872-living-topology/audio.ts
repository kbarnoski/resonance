/*
 * 872 · LIVING TOPOLOGY — Web Audio feedback network
 *
 * A network of high-Q bandpass resonators in feedback loops:
 *   impulse → BiquadFilter(bandpass) → DelayNode → feedbackGain → back to filter
 *
 * Nodes are cross-coupled through per-edge GainNodes whose values are rewritten
 * every animation frame from a Lorenz-driven, time-varying weighted adjacency
 * matrix. The ring backbone is always present (network never fully silent); the
 * chaotic state reshapes the small-world shortcuts and the relative weights.
 *
 * Ear-safety: every path ends in a DynamicsCompressor brick-wall limiter →
 * master GainNode → destination. Self-feedback is hard-clamped below divergence.
 */

export interface Edge {
  from: number;
  to: number;
  base: number; // base coupling weight [0,1]
  ring: boolean; // ring backbone (always active) vs small-world shortcut
}

export interface AudioGraph {
  ctx: AudioContext;
  filters: BiquadFilterNode[];
  delays: DelayNode[];
  feedbackGains: GainNode[];
  outputGains: GainNode[];
  analysers: AnalyserNode[];
  impulseGains: GainNode[];
  couplingGains: (GainNode | null)[][];
  masterGain: GainNode;
  limiter: DynamicsCompressorNode;
}

export const NODE_COUNT = 11;
export const ROOT_HZ = 55; // A1

// Overtone series on A1 — coupled nodes reinforce each other's partials.
export function buildFrequencies(): number[] {
  const partials = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
  return partials.slice(0, NODE_COUNT).map((n) => ROOT_HZ * n);
}

// Watts-Strogatz-flavored small-world graph: ring backbone + shortcut chords.
export function buildEdges(): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const next = (i + 1) % NODE_COUNT;
    edges.push({ from: i, to: next, base: 0.7, ring: true });
    edges.push({ from: next, to: i, base: 0.7, ring: true });
  }
  // Small-world shortcuts (chords across the ring). These are the edges the
  // Lorenz state activates / fades over time.
  const shortcuts: Array<[number, number]> = [
    [0, 4],
    [1, 6],
    [2, 8],
    [3, 9],
    [5, 10],
    [7, 0],
    [4, 9],
    [6, 2],
    [8, 3],
    [10, 1],
  ];
  for (const [a, b] of shortcuts) {
    edges.push({ from: a, to: b, base: 0.4, ring: false });
    edges.push({ from: b, to: a, base: 0.4, ring: false });
  }
  return edges;
}

// Ear-safety hard clamps.
const MAX_FB_GAIN = 0.86; // below divergence point (~0.88)
const MAX_COUPLING = 0.32;

export function buildAudioGraph(freqs: number[], edges: Edge[]): AudioGraph {
  const ctx = new AudioContext();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.22;

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
    f.Q.value = 26 + (i % 4) * 6;

    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = Math.min(0.5, 1 / freqs[i]);

    const fbGain = ctx.createGain();
    fbGain.gain.value = 0;

    const outGain = ctx.createGain();
    outGain.gain.value = 0.5;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    const impulse = ctx.createGain();
    impulse.gain.value = 1;

    // impulse → filter → delay → feedbackGain → (filter)
    //                   filter → outGain → analyser → limiter
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

  // Per-edge coupling gains: filter[from] → g → filter[to]
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
    impulseGains,
    couplingGains,
    masterGain,
    limiter,
  };
}

export function applyFeedbackGain(g: AudioGraph, selfFb: number): void {
  const clamped = Math.min(selfFb, MAX_FB_GAIN);
  for (const fb of g.feedbackGains) {
    fb.gain.setTargetAtTime(clamped, g.ctx.currentTime, 0.05);
  }
}

/*
 * The heart of the piece: rewrite every coupling-edge gain from the Lorenz
 * state. Returns a per-edge "live weight" array (same order as `edges`) so the
 * renderer can draw edge brightness/width from the same values the ear hears.
 *
 * Mapping:
 *   - global coupling gain          ← lz.z   (overall density swells/recedes)
 *   - ring backbone weight          ← always on, gently modulated by lz.y
 *   - which shortcuts are "active"  ← phase wheel rotated by lz.x  +  lz.* gates
 */
export function applyTopology(
  g: AudioGraph,
  edges: Edge[],
  lz: { x: number; y: number; z: number },
  globalCoupling: number
): number[] {
  const liveWeights = new Array<number>(edges.length).fill(0);
  // Global density from z, scaled by the user's coupling slider.
  const density = (0.45 + 0.55 * lz.z) * globalCoupling;
  // A rotating "active arc" over the shortcut chords, driven by x.
  const rot = lz.x * Math.PI * 2;

  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    let w: number;
    if (edge.ring) {
      // Backbone always present; y gives it a slow breathing modulation.
      w = edge.base * (0.6 + 0.4 * lz.y);
    } else {
      // Shortcut: gated by a smooth window that sweeps around the ring with x,
      // and lifted/lowered by y. Some shortcuts strengthen as others fade.
      const pairPhase =
        ((edge.from + edge.to) / (NODE_COUNT * 2)) * Math.PI * 2;
      const window = 0.5 + 0.5 * Math.cos(pairPhase - rot);
      w = edge.base * window * (0.25 + 0.75 * lz.y);
    }
    const target = Math.min(MAX_COUPLING, density * w);
    liveWeights[e] = target;
    const node = g.couplingGains[edge.from]?.[edge.to];
    if (node) {
      node.gain.setTargetAtTime(target, g.ctx.currentTime, 0.12);
    }
  }
  return liveWeights;
}

export function applyMasterVolume(g: AudioGraph, vol: number): void {
  g.masterGain.gain.setTargetAtTime(vol, g.ctx.currentTime, 0.05);
}

export function applyMute(g: AudioGraph): void {
  g.masterGain.gain.setTargetAtTime(0, g.ctx.currentTime, 0.01);
}

// Short noise burst into node i — perturbs the dynamical system.
export function injectImpulse(g: AudioGraph, nodeIdx: number, level = 0.6): void {
  const ctx = g.ctx;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let k = 0; k < data.length; k++) {
    const env = 1 - k / data.length;
    data[k] = (Math.random() * 2 - 1) * level * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(g.impulseGains[nodeIdx]);
  src.start();
  src.stop(ctx.currentTime + 0.05);
}

// RMS energy from an analyser, [0,1].
export function readEnergy(analyser: AnalyserNode, buf: Uint8Array): number {
  analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const s = (buf[i] - 128) / 128;
    sum += s * s;
  }
  return Math.sqrt(sum / buf.length);
}
