// audio.ts — physics-based sonification of the melting lattice.
//
// The whole screen is treated as ONE struck crystal bell whose 6 modes map to
// the 6 physics regions. Per-region strain-energy RATE excites each mode (like
// a strike); per-region MELT reshapes that mode's timbre — a hard crystal rings
// bright, high-Q and inharmonic (bell-like); as the region melts the mode
// detunes downward, its Q collapses and a low-pass smears it into a soft watery
// wash. The deformation is the composer (see BioSonix, arXiv:2508.14688).
//
// Signal chain per voice v:
//   noise --> exGain[v] --> bandpass[v] --> lpf[v] --> voiceGain[v] --> master
// master --> compressor (limiter) --> destination.

import { REGION_COUNT } from "./physics";

// Bell-partial ratios (hum, prime, tierce, quint, nominal, upper) — luminous,
// mildly inharmonic. Region v rings partial v of one big crystal bell.
const BELL_RATIOS = [0.5, 1.0, 1.2, 1.5, 2.0, 2.667];
const F0 = 196; // G3 fundamental

const CRYSTAL_Q = 26;
const MOLTEN_Q = 4.5;
const CRYSTAL_LPF = 9000;
const MOLTEN_LPF = 620;

type Voice = {
  ex: GainNode;
  bp: BiquadFilterNode;
  lpf: BiquadFilterNode;
  gain: GainNode;
  baseFreq: number;
  env: number; // JS-side strike envelope
  drift: number; // slow watery detune phase
};

export type AudioRig = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  update: (
    regionExcite: Float32Array,
    regionMelt: Float32Array,
    avgMelt: number,
  ) => void;
  setMaster: (v: number) => void;
  dispose: () => void;
};

export function makeAudioRig(): AudioRig | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;
  const ctx = new Ctor();

  // Master limiter so the wash never clips.
  const master = ctx.createGain();
  master.gain.value = 0.0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);

  // Shared pink-ish noise buffer (looping) is the excitation source.
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  for (let i = 0; i < len; i++) {
    const white = (i * 2654435761) % 1000;
    const w = (white / 500 - 1) * 0.6 + (((i * 40503) % 200) / 100 - 1) * 0.4;
    b0 = 0.99 * b0 + 0.1 * w;
    b1 = 0.96 * b1 + 0.15 * w;
    data[i] = (b0 + b1 + w * 0.5) * 0.4;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;

  const voices: Voice[] = [];
  for (let v = 0; v < REGION_COUNT; v++) {
    const baseFreq = F0 * BELL_RATIOS[v % BELL_RATIOS.length];
    const ex = ctx.createGain();
    ex.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = baseFreq;
    bp.Q.value = CRYSTAL_Q;
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = CRYSTAL_LPF;
    lpf.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.9 / REGION_COUNT;

    noise.connect(ex);
    ex.connect(bp);
    bp.connect(lpf);
    lpf.connect(gain);
    gain.connect(master);

    voices.push({ ex, bp, lpf, gain, baseFreq, env: 0, drift: v * 1.7 });
  }
  noise.start();

  let masterTarget = 0.9;

  const resume = async () => {
    if (ctx.state === "suspended") await ctx.resume();
    master.gain.setTargetAtTime(masterTarget, ctx.currentTime, 0.4);
  };

  const setMaster = (val: number) => {
    masterTarget = val;
    master.gain.setTargetAtTime(val, ctx.currentTime, 0.2);
  };

  const update = (
    regionExcite: Float32Array,
    regionMelt: Float32Array,
    avgMelt: number,
  ) => {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    for (let v = 0; v < voices.length; v++) {
      const vo = voices[v];
      const m = Math.min(1, regionMelt[v]);
      // strike envelope: impact adds energy, then rings down
      const impact = Math.min(3, regionExcite[v] * 40);
      vo.env = vo.env * 0.9 + impact;
      // molten regions ring longer & wetter (more excitation floor)
      const floor = 0.006 + 0.02 * m;
      const level = Math.min(0.9, floor + vo.env * 0.05);
      vo.ex.gain.setTargetAtTime(level, now, 0.02);

      // watery detune drift when molten (deterministic slow wobble)
      vo.drift += 0.02 + m * 0.05;
      const wobble = m * 0.06 * Math.sin(vo.drift);
      // melt detunes the mode DOWN and toward its neighbours (spectrum collapse)
      const freq = vo.baseFreq * (1 - 0.42 * m) * (1 + wobble);
      vo.bp.frequency.setTargetAtTime(freq, now, 0.05);
      const q = CRYSTAL_Q * (1 - m) + MOLTEN_Q * m;
      vo.bp.Q.setTargetAtTime(q, now, 0.08);
      const cutoff = CRYSTAL_LPF * (1 - m) + MOLTEN_LPF * m;
      vo.lpf.frequency.setTargetAtTime(cutoff, now, 0.08);
    }
    // overall wash swells a touch as the solid liquefies
    const swell = 0.8 + 0.25 * avgMelt;
    master.gain.setTargetAtTime(masterTarget * swell, now, 0.3);
  };

  const dispose = () => {
    try {
      noise.stop();
    } catch {
      // already stopped
    }
    void ctx.close();
  };

  return { ctx, resume, update, setMaster, dispose };
}
