// audio.ts — mic analysis + the comic "honk-back" DSP, all kid-safe.
//
// Master chain (non-negotiable): gain -> lowpass(<=8kHz) -> brick-wall
// compressor/limiter -> destination. Nothing ever gets painfully loud or
// shrill. Every honk and the live mic both route through this chain.
//
// The honk is NOT a clean replay. We take the kid's loudness + rough pitch and
// fire a goofy HONK: a couple of detuned sawtooth oscillators run through a
// WaveShaper (cartoon clip) and a ring-modulator, bandpass-swept so it sounds
// like a kazoo / rubber duck. Classic-cartoon foley energy (Carl Stalling /
// Treg Brown honks), pitched by the child's own voice.

export type Engine = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  master: GainNode;
  honkBus: GainNode;
  liveBus: GainNode; // the kid's own voice, distorted, fed back softly
  freqData: Uint8Array<ArrayBuffer>;
  timeData: Uint8Array<ArrayBuffer>;
  micOn: boolean;
};

export type Reading = {
  rms: number; // 0..1 loudness
  pitch: number; // rough Hz (centroid-based), 0 if quiet
  pitchNorm: number; // 0..1 mapped pitch for hue/honk
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWin = any;

function makeShaperCurve(amount: number): Float32Array<ArrayBuffer> {
  // soft cartoon saturation — gentle, never a harsh fuzz
  const n = 1024;
  // Allocate over an explicit ArrayBuffer so the type is Float32Array<ArrayBuffer>,
  // which is what WaveShaperNode.curve expects in recent lib.dom.
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

export function makeEngine(): Engine {
  const Ctor =
    (window as AnyWin).AudioContext || (window as AnyWin).webkitAudioContext;
  const ctx: AudioContext = new Ctor();

  // ---- master safety chain ----
  const master = ctx.createGain();
  master.gain.value = 0.0; // ramp up on start to avoid a click

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7000; // <= 8kHz: no shrill ringing
  lowpass.Q.value = 0.4;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(limiter);
  limiter.connect(ctx.destination);

  // honk + live voice both feed the master
  const honkBus = ctx.createGain();
  honkBus.gain.value = 1.0;
  honkBus.connect(master);

  const liveBus = ctx.createGain();
  liveBus.gain.value = 0.0; // raised only when mic is live
  liveBus.connect(master);

  // analyser is fed by mic OR a tiny silent source; created up front
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;

  return {
    ctx,
    analyser,
    master,
    honkBus,
    liveBus,
    // Explicit ArrayBuffer allocation -> Uint8Array<ArrayBuffer>, which the
    // analyser getByte* methods require under recent TS lib.dom.
    freqData: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
    timeData: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
    micOn: false,
  };
}

export function rampMaster(e: Engine, to: number, secs = 0.3) {
  const now = e.ctx.currentTime;
  e.master.gain.cancelScheduledValues(now);
  e.master.gain.setValueAtTime(e.master.gain.value, now);
  e.master.gain.linearRampToValueAtTime(to, now + secs);
}

// Wire a live mic stream into both the analyser and a distorted live bus.
export function attachMic(e: Engine, stream: MediaStream) {
  const src = e.ctx.createMediaStreamSource(stream);
  src.connect(e.analyser);

  // live voice -> gentle cartoon distortion -> bandpass -> liveBus (quiet)
  const shaper = e.ctx.createWaveShaper();
  shaper.curve = makeShaperCurve(6);
  const bp = e.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 1.5;
  src.connect(shaper);
  shaper.connect(bp);
  bp.connect(e.liveBus);
  e.liveBus.gain.value = 0.18; // a touch of "talkie" echo, kept low
  e.micOn = true;
}

export function readMic(e: Engine): Reading {
  e.analyser.getByteTimeDomainData(e.timeData);
  e.analyser.getByteFrequencyData(e.freqData);

  // RMS from time domain
  let sum = 0;
  for (let i = 0; i < e.timeData.length; i++) {
    const v = (e.timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / e.timeData.length);
  // scale: typical speech ~0.02..0.1, yelling higher — boost & clamp
  const loud = Math.min(1, rms * 6);

  // spectral centroid -> rough pitch
  const bins = e.freqData.length;
  const nyq = e.ctx.sampleRate / 2;
  let wsum = 0;
  let amp = 0;
  for (let i = 1; i < bins; i++) {
    const f = (i / bins) * nyq;
    if (f > 4000) break; // ignore hiss
    const a = e.freqData[i];
    wsum += f * a;
    amp += a;
  }
  const pitch = amp > 0 ? wsum / amp : 0;
  // map ~150..1200Hz to 0..1 for hue/honk
  const pitchNorm = Math.max(0, Math.min(1, (pitch - 150) / (1200 - 150)));

  return { rms: loud, pitch, pitchNorm };
}

// Fire a comic HONK. loud 0..1 -> volume + length; pitchNorm 0..1 -> tone.
// Two detuned saws -> ring mod -> waveshaper -> swept bandpass -> honkBus.
export function honk(e: Engine, loud: number, pitchNorm: number) {
  const ctx = e.ctx;
  const t = ctx.currentTime;
  const dur = 0.16 + loud * 0.22;

  // base honk pitch: kid voice bends it. Kept in a friendly mid range.
  const base = 160 + pitchNorm * 300; // ~160..460 Hz

  const osc1 = ctx.createOscillator();
  osc1.type = "sawtooth";
  osc1.frequency.setValueAtTime(base, t);
  // a little downward "honk" droop then up = goofy
  osc1.frequency.linearRampToValueAtTime(base * 0.82, t + dur * 0.4);
  osc1.frequency.linearRampToValueAtTime(base * 1.05, t + dur);

  const osc2 = ctx.createOscillator();
  osc2.type = "square";
  osc2.frequency.setValueAtTime(base * 1.005, t); // detune -> buzzy beat
  osc2.detune.value = 12;

  // ring modulator: multiply by a low tone -> kazoo/duck buzz
  const ring = ctx.createGain();
  ring.gain.value = 0;
  const ringOsc = ctx.createOscillator();
  ringOsc.type = "sine";
  ringOsc.frequency.value = 55 + pitchNorm * 90;
  ringOsc.connect(ring.gain); // amplitude-modulate

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeShaperCurve(10);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.linearRampToValueAtTime(1400 + pitchNorm * 1200, t + dur * 0.5);
  bp.frequency.linearRampToValueAtTime(600, t + dur);

  const env = ctx.createGain();
  const peak = 0.18 + loud * 0.5;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.012); // quick but not a click
  env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

  osc1.connect(ring);
  osc2.connect(ring);
  ring.connect(shaper);
  shaper.connect(bp);
  bp.connect(env);
  env.connect(e.honkBus);

  osc1.start(t);
  osc2.start(t);
  ringOsc.start(t);
  osc1.stop(t + dur + 0.05);
  osc2.stop(t + dur + 0.05);
  ringOsc.stop(t + dur + 0.05);
}
