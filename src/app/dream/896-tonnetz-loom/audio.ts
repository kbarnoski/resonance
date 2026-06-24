// 896-tonnetz-loom — just-intonation triad engine.
// A triad is sounded as three OscillatorNodes built from PURE ratios relative
// to the triad root (major 4:5:6, minor 10:12:15), each warm voice = two
// detuned triangle oscillators → per-voice gain envelope → shared reverb
// (procedural ConvolverNode impulse) + master limiter (DynamicsCompressor) →
// destination. All graph nodes live behind this class (managed via refs in the
// page), never created at module top level (prerender-safe).

// Just-intonation ratios. The chord is built ON the root, so the root sits at
// `1` and the other voices are exact small-integer ratios above it.
//   major triad → 4 : 5 : 6   (i.e. 1, 5/4, 3/2)
//   minor triad → 10 : 12 : 15 (i.e. 1, 6/5, 3/2)
export const JI_MAJOR = [1, 5 / 4, 3 / 2] as const;
export const JI_MINOR = [1, 6 / 5, 3 / 2] as const;

export type Quality = "major" | "minor";

// Map a pitch class + octave to an equal-tempered reference frequency. We use
// this only to choose the *root* register; the chord intervals themselves are
// pure JI ratios on top of that root, so the consonance is real.
function pcToHz(pc: number, octave: number): number {
  // MIDI note number for pc in given octave (C4 = 60).
  const midi = (octave + 1) * 12 + pc;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

type Voice = {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gain: GainNode;
};

export class TonnetzEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private reverb: ConvolverNode;
  private dry: GainNode;
  private wet: GainNode;
  // Currently-sustaining voices, one per chord tone (so PLR can glide them).
  private voices: Voice[] = [];
  private currentFreqs: number[] = [];

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.buildImpulse(2.4, 2.6);

    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.7;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.45;

    // voices → master → (dry + wet→reverb) → limiter → destination
    this.master.connect(this.dry);
    this.master.connect(this.wet);
    this.wet.connect(this.reverb);
    this.dry.connect(this.limiter);
    this.reverb.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  // A simple exponential-decay noise impulse — a soft, diffuse hall.
  private buildImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  // Compute the three JI frequencies for a triad rooted at (rootPc, octave).
  freqsFor(rootPc: number, quality: Quality, octave = 3): number[] {
    const rootHz = pcToHz(rootPc, octave);
    const ratios = quality === "major" ? JI_MAJOR : JI_MINOR;
    return ratios.map((r) => rootHz * r);
  }

  private buildVoice(freq: number, now: number): Voice {
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    oscA.type = "triangle";
    oscB.type = "triangle";
    oscA.frequency.setValueAtTime(freq, now);
    oscB.frequency.setValueAtTime(freq, now);
    oscB.detune.setValueAtTime(6, now); // gentle chorus
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(this.master);
    oscA.start(now);
    oscB.start(now);
    return { oscA, oscB, gain };
  }

  // Strike a fresh triad. Stops any prior voices and grows new ones with a soft
  // attack. Returns the frequencies sounded (so the visual can mirror them).
  strike(freqs: number[]): number[] {
    const now = this.ctx.currentTime;
    this.stopVoices(now, 0.18);
    const perVoice = 0.16;
    this.voices = freqs.map((f) => {
      const v = this.buildVoice(f, now);
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(0.0001, now);
      v.gain.gain.exponentialRampToValueAtTime(perVoice, now + 0.04);
      // long, slowly-decaying sustain so PLR moves feel like one breath
      v.gain.gain.setTargetAtTime(perVoice * 0.55, now + 0.04, 1.4);
      return v;
    });
    this.currentFreqs = freqs.slice();
    return this.currentFreqs;
  }

  // Voice-leading glide: keep voices alive and ramp each oscillator from its
  // current frequency to the new target. This is what makes P/L/R *sound* like
  // a single voice moving while the common tones hold.
  glideTo(freqs: number[]): number[] {
    if (this.voices.length !== freqs.length) {
      return this.strike(freqs);
    }
    const now = this.ctx.currentTime;
    const glide = 0.28;
    const perVoice = 0.16;
    freqs.forEach((f, i) => {
      const v = this.voices[i];
      v.oscA.frequency.cancelScheduledValues(now);
      v.oscB.frequency.cancelScheduledValues(now);
      v.oscA.frequency.exponentialRampToValueAtTime(f, now + glide);
      v.oscB.frequency.exponentialRampToValueAtTime(f, now + glide);
      // re-energize the envelope so the move stays audible
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(perVoice, now + 0.05);
      v.gain.gain.setTargetAtTime(perVoice * 0.55, now + 0.05, 1.4);
    });
    this.currentFreqs = freqs.slice();
    return this.currentFreqs;
  }

  private stopVoices(now: number, fade: number) {
    const dying = this.voices;
    this.voices = [];
    dying.forEach((v) => {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        v.oscA.stop(now + fade + 0.05);
        v.oscB.stop(now + fade + 0.05);
      } catch {
        /* node may already be stopped */
      }
    });
  }

  async dispose(): Promise<void> {
    const now = this.ctx.currentTime;
    this.stopVoices(now, 0.1);
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
