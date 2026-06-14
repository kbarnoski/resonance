// audio.ts — self-oscillating no-input feedback network.
//
// Signal path (a single loop, NO external source):
//
//   feedbackGain ──> delay ──> bandpass ──> peaking ──> waveShaper(soft) ──┐
//        ^                                                                  │
//        └──────────────────── dcBlocker(highpass) ────────────────────────┘
//                                                                          │
//   delay also taps ──> postFilterTap ──> masterGain ──> limiter ──> analyser ──> destination
//
// The loop sustains itself once a tiny seed kicks it. Loop gain sits just
// below 1.0 so it howls without running away. Every safety clamp the brief
// demands lives here.

export type HowlState = {
  ctx: AudioContext;
  // loop nodes
  delay: DelayNode;
  bandpass: BiquadFilterNode; // tunable resonant peak (the "pitch")
  peaking: BiquadFilterNode; // resonance shaping
  shaper: WaveShaperNode; // soft saturation — the abrasive edge
  dcBlock: BiquadFilterNode; // highpass DC blocker
  feedbackGain: GainNode; // THE tension knob (hard-capped)
  // master chain
  masterGain: GainNode;
  limiter: DynamicsCompressorNode; // brick-wall safety
  analyser: AnalyserNode;
  freqData: Uint8Array;
  timeData: Uint8Array;
  // live params (smoothed targets are written to nodes directly)
  params: HowlParams;
  seedNoise: () => void;
};

export type HowlParams = {
  loopGain: number; // 0 .. LOOP_GAIN_MAX
  delayHz: number; // expressed as a frequency; delayTime = 1/delayHz
  cutoff: number; // bandpass center Hz
  resonance: number; // bandpass Q
  master: number; // 0..1 user volume
  muted: boolean;
};

// ── Hard safety limits ──────────────────────────────────────────────────────
export const LOOP_GAIN_MAX = 0.985; // never reach 1.0 → never true runaway
export const DELAY_HZ_MIN = 40;
export const DELAY_HZ_MAX = 1200;
export const CUTOFF_MIN = 120;
export const CUTOFF_MAX = 7000;
export const Q_MIN = 0.5;
export const Q_MAX = 22;
const MASTER_START = 0.32; // sane starting volume

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Soft-saturation curve: tanh-like, tames peaks while adding harsh harmonics.
function makeSaturationCurve(amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export function makeDefaultParams(): HowlParams {
  return {
    loopGain: 0.78,
    delayHz: 220,
    cutoff: 900,
    resonance: 9,
    master: MASTER_START,
    muted: false,
  };
}

export async function makeHowl(): Promise<HowlState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: any =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctor();

  const params = makeDefaultParams();

  // ── loop nodes ──
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 1 / params.delayHz;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = params.cutoff;
  bandpass.Q.value = params.resonance;

  const peaking = ctx.createBiquadFilter();
  peaking.type = "peaking";
  peaking.frequency.value = params.cutoff * 1.5;
  peaking.Q.value = 4;
  peaking.gain.value = 6;

  const shaper = ctx.createWaveShaper();
  // Cast: lib.dom expects Float32Array<ArrayBuffer> but our typed array is the
  // wider Float32Array<ArrayBufferLike> under strict TS — same mismatch as the
  // analyser buffers below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shaper.curve = makeSaturationCurve(2.4) as any;
  shaper.oversample = "4x";

  // DC blocker: highpass kills sub-rumble pile-up that wrecks feedback loops.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = "highpass";
  dcBlock.frequency.value = 90;
  dcBlock.Q.value = 0.4;

  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = 0; // start silent; auto-demo ramps it up

  // ── master / safety chain ──
  const masterGain = ctx.createGain();
  masterGain.gain.value = params.muted ? 0 : params.master;

  const limiter = ctx.createDynamicsCompressor();
  // brick-wall-ish limiter
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  // ── wiring: the feedback ring ──
  // feedbackGain -> delay -> bandpass -> peaking -> shaper -> dcBlock -> feedbackGain
  feedbackGain.connect(delay);
  delay.connect(bandpass);
  bandpass.connect(peaking);
  peaking.connect(shaper);
  shaper.connect(dcBlock);
  dcBlock.connect(feedbackGain); // close the loop

  // tap the loop AFTER shaping into the master chain
  shaper.connect(masterGain);
  masterGain.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // seed: one short burst of noise to break silence and kick oscillation
  const seedNoise = () => {
    const dur = 0.18;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      // decaying noise impulse
      ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) * 0.6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const seedGain = ctx.createGain();
    seedGain.gain.value = 0.5;
    src.connect(seedGain);
    seedGain.connect(delay); // inject directly into the loop
    src.start();
    src.stop(ctx.currentTime + dur);
  };

  const state: HowlState = {
    ctx,
    delay,
    bandpass,
    peaking,
    shaper,
    dcBlock,
    feedbackGain,
    masterGain,
    limiter,
    analyser,
    freqData,
    timeData,
    params,
    seedNoise,
  };

  return state;
}

// Smoothly steer a param toward a target value (called on input / demo wander).
export function applyParams(s: HowlState, p: Partial<HowlParams>) {
  const now = s.ctx.currentTime;
  const glide = 0.06;
  Object.assign(s.params, p);
  const P = s.params;

  P.loopGain = clamp(P.loopGain, 0, LOOP_GAIN_MAX);
  P.delayHz = clamp(P.delayHz, DELAY_HZ_MIN, DELAY_HZ_MAX);
  P.cutoff = clamp(P.cutoff, CUTOFF_MIN, CUTOFF_MAX);
  P.resonance = clamp(P.resonance, Q_MIN, Q_MAX);
  P.master = clamp(P.master, 0, 1);

  s.feedbackGain.gain.setTargetAtTime(P.loopGain, now, glide);
  s.delay.delayTime.setTargetAtTime(1 / P.delayHz, now, glide);
  s.bandpass.frequency.setTargetAtTime(P.cutoff, now, glide);
  s.bandpass.Q.setTargetAtTime(P.resonance, now, glide);
  s.peaking.frequency.setTargetAtTime(clamp(P.cutoff * 1.5, 60, 12000), now, glide);
  const targetMaster = P.muted ? 0 : P.master;
  s.masterGain.gain.setTargetAtTime(targetMaster, now, 0.03);
}

// SPACE "stab": momentarily spike loop gain for a screech, then recover.
export function applyStab(s: HowlState) {
  const now = s.ctx.currentTime;
  const base = s.params.loopGain;
  const spike = clamp(base + 0.16, 0, LOOP_GAIN_MAX);
  const g = s.feedbackGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(base, now);
  g.linearRampToValueAtTime(spike, now + 0.04);
  g.setTargetAtTime(base, now + 0.06, 0.25);
  s.seedNoise();
}

// PANIC: instantly kill the loop and mute master. Returns the loop to safe.
export function applyPanic(s: HowlState) {
  const now = s.ctx.currentTime;
  s.feedbackGain.gain.cancelScheduledValues(now);
  s.feedbackGain.gain.setTargetAtTime(0, now, 0.01);
  s.masterGain.gain.setTargetAtTime(0, now, 0.02);
  s.params.loopGain = 0;
  s.params.muted = true;
}

// Read FFT + waveform into the shared buffers. Returns peak level 0..1.
export function readAnalyser(s: HowlState): number {
  // Casts: lib.dom Uint8Array vs ArrayBuffer generic mismatch under strict TS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.analyser.getByteFrequencyData(s.freqData as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.analyser.getByteTimeDomainData(s.timeData as any);
  let peak = 0;
  const t = s.timeData;
  for (let i = 0; i < t.length; i++) {
    const v = Math.abs(t[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return peak;
}
