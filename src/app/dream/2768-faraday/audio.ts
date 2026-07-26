// audio.ts — the see≈hear weld for "2768-faraday".
//
// The dish's emergent standing-wave pattern re-voices the sound that shook it.
// Each frame the field reports a small radial spectrum (K bands); each band is
// one sine partial in an INHARMONIC additive bank. A partial's frequency is
// ω₀(k) of that band's centroid wavenumber mapped into the audible range — a
// continuous consequence of the fluid's own dispersion relation, NEVER snapped
// to a musical scale. Its gain follows the band's spatial energy. So the water
// pattern literally becomes the timbre; louder/denser cells brighten the tone.
//
// The same engine also opens the microphone (optional). Its short-window RMS is
// the vertical shake amplitude a(t) driving the dish. With no mic, the caller
// feeds a deterministic seeded carrier instead — the piece self-demos on load.

import { mulberry32, SEED, type SpectrumBand } from "./field";

const MASTER = 0.26;
const GLIDE = 0.06; // s — frequency/gain smoothing time-constant

export interface Engine {
  ctx: AudioContext;
  /** Resume the AudioContext (call from a user gesture). */
  resume(): Promise<void>;
  /** Re-voice the additive bank from the field's radial spectrum. */
  setBands(bands: SpectrumBand[], drive: number): void;
  /** Try to open the mic; resolves true on success. */
  startMic(): Promise<boolean>;
  /** Current mic short-window RMS (0..1), or null when no mic. */
  micLevel(): number | null;
  silence(): void;
  dispose(): void;
}

/** Short exponential-decay stereo impulse (seeded) for a slow watery tail. */
function makeReverbIR(ctx: AudioContext): AudioBuffer {
  const rng = mulberry32(SEED ^ 0x51fb);
  const len = Math.floor(ctx.sampleRate * 2.6);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
  }
  return ir;
}

export function buildEngine(partialCount: number): Engine {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = MASTER;
  // gentle low-pass so the additive bank reads as water, not glass
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  tone.Q.value = 0.3;
  tone.connect(master);
  master.connect(ctx.destination);

  const dry = ctx.createGain();
  dry.gain.value = 0.75;
  dry.connect(tone);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbIR(ctx);
  reverb.connect(wet);
  wet.connect(tone);

  // one persistent oscillator + gain per band (no per-frame node churn)
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let i = 0; i < partialCount; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(dry);
    g.connect(reverb);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  // mic
  let micStream: MediaStream | null = null;
  let micAnalyser: AnalyserNode | null = null;
  let micBuf: Float32Array<ArrayBuffer> | null = null;

  const setBands = (bands: SpectrumBand[], drive: number): void => {
    const t = ctx.currentTime;
    // overall voice presence follows how hard the dish is being shaken and how
    // much standing-wave energy actually formed.
    const gate = Math.min(1, Math.max(0, (drive - 0.35) / 0.9));
    let totalE = 0;
    for (const b of bands) totalE += b.energy;
    const norm = totalE > 1e-6 ? 1 / totalE : 0;
    for (let i = 0; i < oscs.length; i++) {
      const b = bands[i];
      if (!b) continue;
      // continuous, physics-derived frequency — glide, never step to a scale
      oscs[i].frequency.setTargetAtTime(b.hz, t, GLIDE);
      const amp = b.energy * norm * gate * 0.9;
      gains[i].gain.setTargetAtTime(amp, t, GLIDE);
    }
  };

  const startMic = async (): Promise<boolean> => {
    if (micAnalyser) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStream = stream;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an); // NOT to destination — no feedback
      micAnalyser = an;
      micBuf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
      return true;
    } catch {
      return false;
    }
  };

  const micLevel = (): number | null => {
    if (!micAnalyser || !micBuf) return null;
    micAnalyser.getFloatTimeDomainData(micBuf);
    let sq = 0;
    for (let i = 0; i < micBuf.length; i++) sq += micBuf[i] * micBuf[i];
    return Math.sqrt(sq / micBuf.length);
  };

  return {
    ctx,
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },
    setBands,
    startMic,
    micLevel,
    silence() {
      const t = ctx.currentTime;
      for (const g of gains) g.gain.setTargetAtTime(0, t, 0.08);
    },
    dispose() {
      for (const o of oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      micStream?.getTracks().forEach((tr) => tr.stop());
      micStream = null;
      micAnalyser = null;
      micBuf = null;
      window.setTimeout(() => {
        void ctx.close();
      }, 200);
    },
  };
}
