// audio.ts — granular impulse synthesis for a crowd's applause. NO pitch.
//
// Every clap is a few-ms burst of white noise shaped by a randomized bandpass,
// so each has its own papery character. Thousands of claps can't each be a
// graph node, so an AudioWorklet owns a small pool of grains and is *driven*
// by one compact message per animation frame:
//   • bed   — steady presence of the crowd (spawns a continuous hiss of claps)
//   • pulse — the fraction that clapped THIS frame (spawns a tight cluster)
//   • r     — coherence; grains in a burst spread across the frame when r is
//             low (diffuse patter) and stack together when r is high (a single
//             thunderous UNISON smack). So the sync transition is audible in
//             the grain timing itself.
//   • cheer — a low band-limited noise bed + rare whistles at peak, for the joke.
//
// All randomness inside the worklet is a seeded mulberry32 too (deterministic).

const WORKLET_SRC = `
const TWO_PI = Math.PI * 2;
function makeRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class ClapProcessor extends AudioWorkletProcessor {
  constructor(options){
    super();
    const seed = (options && options.processorOptions && options.processorOptions.seed) || 0x2566;
    this.rng = makeRng(seed);
    this.sr = sampleRate;
    this.POOL = 160;
    // Grain state (structure-of-arrays).
    this.gOn = new Uint8Array(this.POOL);
    this.gDelay = new Float32Array(this.POOL);   // samples until start
    this.gAge = new Float32Array(this.POOL);      // samples since start
    this.gLen = new Float32Array(this.POOL);      // total samples
    this.gAmp = new Float32Array(this.POOL);
    this.gK = new Float32Array(this.POOL);        // env decay rate
    this.gLo = new Float32Array(this.POOL);       // highpass coef
    this.gHi = new Float32Array(this.POOL);       // lowpass coef
    this.gLoS = new Float32Array(this.POOL);      // filter state
    this.gHiS = new Float32Array(this.POOL);
    this.head = 0;
    // Smoothed control params.
    this.bed = 0; this.pulse = 0; this.r = 0; this.cheer = 0;
    this.tgtBed = 0; this.tgtR = 0; this.tgtCheer = 0;
    this.bedAcc = 0; // fractional grain accumulator for the steady bed
    // Cheer bed (crowd roar undertone) + whistle scheduler.
    this.roarLo = 0; this.roarBp1 = 0; this.roarBp2 = 0; this.roarSweep = 0;
    this.whistle = null;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'ctl'){
        this.tgtBed = d.bed; this.tgtR = d.r; this.tgtCheer = d.cheer;
        // Burst: a cluster of grains for this frame's synchronized claps.
        if (d.pulse > 0.0001) this.spawnBurst(d.pulse, d.r, d.bed);
      }
    };
  }
  frameSamples(){ return this.sr / 60; }
  spawnGrain(delay, amp, centerHz, bwOct){
    const i = this.head; this.head = (this.head + 1) % this.POOL;
    const rng = this.rng;
    const lenMs = 3 + rng() * 9;
    const len = (lenMs / 1000) * this.sr;
    const lo = centerHz * Math.pow(2, -bwOct * 0.5) * (0.7 + rng() * 0.6);
    const hi = centerHz * Math.pow(2, bwOct * 0.5) * (0.9 + rng() * 0.5);
    this.gOn[i] = 1;
    this.gDelay[i] = Math.max(0, delay);
    this.gAge[i] = 0;
    this.gLen[i] = len;
    this.gAmp[i] = amp;
    this.gK[i] = (2.5 + rng() * 3.5) / len;
    this.gLo[i] = 1 - Math.exp(-TWO_PI * Math.min(lo, this.sr * 0.45) / this.sr);
    this.gHi[i] = 1 - Math.exp(-TWO_PI * Math.min(hi, this.sr * 0.45) / this.sr);
    this.gLoS[i] = 0; this.gHiS[i] = 0;
  }
  // A cluster of claps landing this frame. High r => tight in time & timbre
  // (unison smack); low r => smeared across the frame (diffuse patter).
  spawnBurst(pulse, r, bed){
    const rng = this.rng;
    const frame = this.frameSamples();
    const nGrains = Math.max(1, Math.min(26, Math.round(2 + pulse * 34)));
    const spread = (1 - r) * frame * 1.1; // temporal smear
    // Louder, tighter timbre when coherent; sum kept bounded via 1/sqrt(n).
    const amp = (0.9 + bed * 0.5) * (0.55 + r * 0.9) / Math.sqrt(nGrains);
    const tightness = 0.35 + r * 0.6; // center-freq convergence at high r
    const centerBase = 1500 + rng() * 900;
    for (let k = 0; k < nGrains; k++){
      const delay = rng() * spread;
      const cf = centerBase * (1 + (rng() - 0.5) * (1 - tightness) * 1.6) * (0.8 + rng() * 0.5);
      this.spawnGrain(delay, amp * (0.7 + rng() * 0.6), cf, 1.6);
    }
  }
  process(inputs, outputs){
    const out = outputs[0];
    const chL = out[0];
    const chR = out.length > 1 ? out[1] : null;
    const N = chL.length;
    const rng = this.rng;

    // Smooth controls toward targets.
    const sm = 0.02;
    this.bed += (this.tgtBed - this.bed) * sm;
    this.r += (this.tgtR - this.r) * sm;
    this.cheer += (this.tgtCheer - this.cheer) * sm;

    // Steady bed: spawn faint claps at a rate proportional to bed presence.
    // Poisson-ish via a fractional accumulator across the block.
    const bedRate = this.bed * this.bed * 520; // grains/sec at full roar
    this.bedAcc += (bedRate * N) / this.sr;
    while (this.bedAcc >= 1){
      this.bedAcc -= 1;
      const delay = rng() * N;
      const cf = 1200 + rng() * 1800;
      const amp = 0.06 + this.bed * 0.05;
      this.spawnGrain(delay, amp * (0.6 + rng() * 0.8), cf, 1.8);
    }

    for (let s = 0; s < N; s++){
      let acc = 0;
      // Grains.
      for (let i = 0; i < this.POOL; i++){
        if (!this.gOn[i]) continue;
        if (this.gDelay[i] >= 1){ this.gDelay[i] -= 1; continue; }
        const age = this.gAge[i]++;
        if (age >= this.gLen[i]){ this.gOn[i] = 0; continue; }
        const white = rng() * 2 - 1;
        // Bandpass: subtractive highpass then one-pole lowpass.
        this.gLoS[i] += this.gLo[i] * (white - this.gLoS[i]);
        const hp = white - this.gLoS[i];
        this.gHiS[i] += this.gHi[i] * (hp - this.gHiS[i]);
        const env = Math.exp(-age * this.gK[i]);
        acc += this.gHiS[i] * env * this.gAmp[i];
      }
      // Crowd roar undertone (band-limited noise) rising with cheer.
      const roarDrive = this.cheer;
      if (roarDrive > 0.001){
        const w = rng() * 2 - 1;
        this.roarLo += 0.02 * (w - this.roarLo);
        const band = this.roarLo;
        this.roarBp1 += 0.006 * (band - this.roarBp1);
        acc += (band - this.roarBp1) * 0.09 * roarDrive;
      }
      // Rare whistle at peak (band-limited sweep), for the joke.
      if (this.whistle){
        const wst = this.whistle;
        wst.phase += wst.freq / this.sr;
        // narrow-band noise-ish: filtered pulse
        const nz = rng() * 2 - 1;
        wst.s += wst.a * (nz - wst.s);
        const bp = nz - wst.s;
        acc += bp * wst.env * 0.12;
        wst.env *= 0.99985;
        wst.freq += wst.glide;
        if (wst.env < 0.002) this.whistle = null;
      } else if (this.cheer > 0.55 && rng() < 0.00018){
        const base = 2600 + rng() * 2600;
        this.whistle = { phase: 0, freq: base, glide: (rng() - 0.3) * 0.9,
          env: 0.5 + rng() * 0.5, a: 0.35, s: 0 };
      }
      // Soft-clip master.
      const y = Math.tanh(acc * 1.6) * 0.42;
      chL[s] = y;
      if (chR) chR[s] = y;
    }
    return true;
  }
}
registerProcessor('clap-processor', ClapProcessor);
`;

export interface CtlMsg {
  bed: number;
  pulse: number;
  r: number;
  cheer: number;
}

export interface AudioEngine {
  resume(): Promise<void>;
  send(m: CtlMsg): void;
  running(): boolean;
  dispose(): void;
}

type CtxCtor = typeof AudioContext;

export async function createAudio(seed = 0x2566): Promise<AudioEngine> {
  const Ctor: CtxCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: CtxCtor }).webkitAudioContext;
  if (!Ctor) throw new Error("no-webaudio");
  const ctx = new Ctor();

  const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const node = new AudioWorkletNode(ctx, "clap-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { seed },
  });

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  const master = ctx.createGain();
  master.gain.value = 0.85;
  node.connect(comp).connect(master).connect(ctx.destination);

  let alive = true;

  return {
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },
    send(m: CtlMsg) {
      if (!alive) return;
      node.port.postMessage({ type: "ctl", ...m });
    },
    running() {
      return alive && ctx.state === "running";
    },
    dispose() {
      alive = false;
      try {
        node.disconnect();
        master.disconnect();
        comp.disconnect();
      } catch {
        /* already torn down */
      }
      void ctx.close();
    },
  };
}
