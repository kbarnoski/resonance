// AudioWorklet source for the GENDYN prototype (1203-gendy).
//
// This module exports a STRING containing the full source of an
// AudioWorkletProcessor. At runtime we wrap it in a Blob, mint an object
// URL, and load it with `audioContext.audioWorklet.addModule(url)`.
// Worklet code runs in AudioWorkletGlobalScope with NO module imports,
// so everything it needs is inlined here.
//
// ── The synthesis: Iannis Xenakis's Dynamic Stochastic Synthesis ──────
// (GENDYN — Formalized Music; the GENDY3 tape piece, 1991.)
//
// A single waveform CYCLE is not a fixed shape — it is defined by a small
// set of BREAKPOINTS, each carrying a time-duration and an amplitude. We
// linearly interpolate between breakpoints to fill the cycle. What makes
// it "dynamic" and "stochastic" is that, once per completed cycle, EVERY
// breakpoint's amplitude AND duration is nudged by a random step (a
// second-order random walk). The walk is bounded by ELASTIC MIRROR
// BARRIERS: overshoot a wall and the value reflects back inside, so the
// waveform stays bounded yet never settles. Tiny steps + tight barriers →
// the shape barely changes cycle-to-cycle → a nearly periodic, pitched
// tone. Large steps + loose barriers → the shape convulses → a gritty,
// living, organic-but-synthetic roar. That drifting of the breakpoints
// is the whole character of GENDYN.

export const WORKLET_SOURCE = String.raw`
const TWO_PI = 6.283185307179586;

// Elastic mirror barrier: fold v back into [lo,hi] by reflection, so a
// random walk that overshoots a wall bounces inward instead of clamping
// flat. This is the "elastic barrier" of Xenakis's random walks.
function reflect(v, lo, hi) {
  const span = hi - lo;
  if (span <= 1e-6) return lo;
  let x = v - lo;
  const p = 2 * span;
  x = x - Math.floor(x / p) * p;   // positive modulo into [0, 2*span)
  if (x > span) x = p - x;         // fold the far half back
  return lo + x;
}

// Small deterministic RNG (xorshift32) so each voice walks its own path
// without pulling on Math.random's shared state.
class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 1; this.spare = null; }
  next() {
    let x = this.s;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  // Gaussian step (Box-Muller) — the random-walk increment distribution.
  gauss() {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    let u = 0; while (u < 1e-9) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const a = TWO_PI * v;
    this.spare = r * Math.sin(a);
    return r * Math.cos(a);
  }
}

// One stochastic voice: N breakpoints, each a (duration, amplitude) pair.
class Voice {
  constructor(sr, n, freq, rng) {
    this.sr = sr; this.n = n; this.freq = freq; this.rng = rng;
    this.amp = new Float32Array(n);
    this.dur = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.amp[i] = Math.sin(TWO_PI * i / n) * 0.4; // seed: a gentle sine
      this.dur[i] = 1;                               // seed: uniform spacing
    }
    // control parameters (order <-> chaos); set live via setChaos.
    this.stepA = 0.01; this.stepD = 0.01;
    this.ampBound = 0.6; this.durLo = 0.7; this.durHi = 1.3;
    this.pitchJit = 0;
    this.seg = 0; this.pos = 0; this.scale = 1; this.segLen = 1;
    this.startCycle(true);
  }
  setFreq(f) { this.freq = f; }
  // Begin a fresh waveform cycle. Unless seeding, first perturb every
  // breakpoint by a bounded random walk (the heart of GENDYN), then
  // renormalise the durations so the cycle length tracks the target pitch
  // (with a little per-cycle jitter that grows with chaos).
  startCycle(seed) {
    if (!seed) {
      for (let i = 0; i < this.n; i++) {
        this.amp[i] = reflect(this.amp[i] + this.rng.gauss() * this.stepA, -this.ampBound, this.ampBound);
        this.dur[i] = reflect(this.dur[i] + this.rng.gauss() * this.stepD, this.durLo, this.durHi);
      }
    }
    let sum = 0;
    for (let i = 0; i < this.n; i++) sum += this.dur[i];
    if (sum < 1e-6) sum = this.n;
    const jit = 1 + (this.rng.next() * 2 - 1) * this.pitchJit;
    const target = (this.sr / this.freq) * jit;
    this.scale = target / sum;
    this.seg = 0; this.pos = 0;
    this.segLen = Math.max(1, this.dur[0] * this.scale);
  }
  // One output sample: linear interpolation along the current segment.
  tick() {
    const n = this.n, amp = this.amp;
    const i1 = this.seg + 1 < n ? this.seg + 1 : 0;
    const t = this.pos / this.segLen;
    const s = amp[this.seg] * (1 - t) + amp[i1] * t;
    this.pos++;
    if (this.pos >= this.segLen) {
      this.seg++;
      this.pos = 0;
      if (this.seg >= n) {
        this.startCycle(false); // completed a cycle → walk the breakpoints
      } else {
        this.segLen = Math.max(1, this.dur[this.seg] * this.scale);
      }
    }
    return s;
  }
}

class GendyProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions) || {};
    const n = cfg.n || 12;
    const base = cfg.base || 55;
    this.mults = cfg.mults || [0.5, 1.0, 2.0];
    this.gains = cfg.gains || [0.5, 0.7, 0.34];
    const seed = cfg.seed || 123456789;
    this.voices = this.mults.map((m, i) => new Voice(sampleRate, n, base * m, new Rng(seed + i * 7919)));
    this.base = base;
    this.frame = 0; this.rms = 0;
    this.setChaos(0.35);
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.type === 'ctrl') {
        if (typeof d.chaos === 'number') this.setChaos(d.chaos);
        if (typeof d.base === 'number') {
          this.base = d.base;
          for (let i = 0; i < this.voices.length; i++) this.voices[i].setFreq(d.base * this.mults[i]);
        }
      }
    };
  }
  // Map the single order<->chaos tension onto every voice's walk. Small
  // steps + tight duration barrier near 1 => nearly periodic pitched tone.
  // Big steps + wide barriers + pitch jitter => gritty stochastic roar.
  setChaos(c) {
    c = Math.max(0, Math.min(1, c));
    this.chaos = c;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      v.stepA = 0.0012 + c * 0.07;
      v.stepD = 0.0008 + c * 0.055;
      v.ampBound = 0.42 + c * 0.5;
      v.durLo = 0.85 - c * 0.55;
      v.durHi = 1.15 + c * 0.8;
      v.pitchJit = c * 0.045;
    }
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    const vs = this.voices, gains = this.gains, nv = vs.length;
    let acc = 0;
    for (let s = 0; s < n; s++) {
      let mix = 0;
      for (let i = 0; i < nv; i++) mix += vs[i].tick() * gains[i];
      // soft-clip the summed bus (warm, never harsh) then hard-clamp.
      mix = Math.tanh(mix * 0.9);
      if (mix > 0.98) mix = 0.98; else if (mix < -0.98) mix = -0.98;
      L[s] = mix; R[s] = mix;
      acc += mix * mix;
    }
    this.rms += (Math.sqrt(acc / n) - this.rms) * 0.2;
    // post the lead voice's living breakpoints for the oscilloscope
    this.frame += n;
    if (this.frame >= 768) {
      this.frame = 0;
      const lead = this.voices[1] || this.voices[0];
      this.port.postMessage({
        type: 'wave',
        amp: lead.amp.slice(0),
        dur: lead.dur.slice(0),
        level: this.rms,
        chaos: this.chaos,
      });
    }
    return true;
  }
}

registerProcessor('gendy-processor', GendyProcessor);
`;
