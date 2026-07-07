// 1244-dayline — Web Audio synthesis. Pure synthesis, no samples, no network.
//
// • ringCity(): a soft bell/pluck when the terminator crosses a city.
//     - pitch  ← latitude  (pentatonic; poleward = higher)
//     - pan    ← longitude  (west = left, east = right)
//     - northern cities get brighter partials
//     - dawn = warmer/softer attack; dusk = slightly darker
// • drone: a low detuned pad whose lowpass cutoff + gain track the normalized
//   sunlit-landmass value, smoothed so it drifts and never jumps.
// • signal path: sources → reverb (convolver) + dry → limiter (compressor) →
//   master gain (~0.2) → destination.

/** Deterministic PRNG (mulberry32) — no Math.random anywhere in this lab. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pentatonic degrees (semitones within an octave) across several octaves.
const PENTA = [0, 2, 4, 7, 9];
const ROOT_MIDI = 50; // D3-ish root for the low end of the scale.

/** Map |latitude| (0..90) to a MIDI note on a pentatonic scale (poleward=high). */
function latToMidi(lat: number): number {
  const frac = Math.min(1, Math.abs(lat) / 90); // equator 0 → pole 1
  const steps = Math.round(frac * (PENTA.length * 4 - 1)); // ~4 octaves of degrees
  const octave = Math.floor(steps / PENTA.length);
  const degree = steps % PENTA.length;
  return ROOT_MIDI + 12 + octave * 12 + PENTA[degree];
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface RingOptions {
  lat: number;
  lon: number;
  isDawn: boolean;
}

export class DaylineAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private reverb: ConvolverNode;
  private reverbGain: GainNode;
  private voiceBus: GainNode;

  // Drone
  private droneOscA: OscillatorNode | null = null;
  private droneOscB: OscillatorNode | null = null;
  private droneSub: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;

  private rng = makeRng(0x1244d1);
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.limiter.connect(this.master).connect(ctx.destination);

    // Reverb send.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.2);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain).connect(this.limiter);

    // Dry voice bus (bells + drone both feed dry + reverb).
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;
    this.voiceBus.connect(this.limiter);
    this.voiceBus.connect(this.reverb);

    // Fade master up smoothly.
    this.master.gain.setTargetAtTime(0.2, ctx.currentTime, 0.4);
  }

  /** Offline-rendered exponential-decay noise impulse for the convolver. */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const noise = this.rng() * 2 - 1;
        data[i] = noise * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const root = midiToFreq(ROOT_MIDI); // D
    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = root;
    oscA.detune.value = -6;

    const oscB = ctx.createOscillator();
    oscB.type = "sawtooth";
    oscB.frequency.value = root;
    oscB.detune.value = 7;

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = root / 2;

    oscA.connect(filter);
    oscB.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.voiceBus);

    oscA.start(now);
    oscB.start(now);
    sub.start(now);

    gain.gain.setTargetAtTime(0.05, now, 1.2);

    this.droneOscA = oscA;
    this.droneOscB = oscB;
    this.droneSub = sub;
    this.droneFilter = filter;
    this.droneGain = gain;
  }

  /** Drive drone fullness from normalized sunlit-landmass value (0..1). */
  setSunlit(value: number): void {
    if (!this.droneFilter || !this.droneGain) return;
    const v = Math.max(0, Math.min(1, value));
    const t = this.ctx.currentTime;
    // Cutoff drifts between a hushed low and a fuller, brighter pad.
    const cutoff = 240 + v * 1400;
    this.droneFilter.frequency.setTargetAtTime(cutoff, t, 0.8);
    const gain = 0.03 + v * 0.09;
    this.droneGain.gain.setTargetAtTime(gain, t, 0.8);
  }

  /** Ring a single city's bell. */
  ringCity(opts: RingOptions): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const midi = latToMidi(opts.lat);
    const freq = midiToFreq(midi);

    // Pan from longitude.
    const pan = Math.max(-1, Math.min(1, opts.lon / 180));
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    // Northern cities → brighter (more/upper partials).
    const northBright = (opts.lat + 90) / 180; // 0..1, higher north
    // Dawn = warmer & softer; dusk = darker & slightly sharper attack.
    const attack = opts.isDawn ? 0.012 : 0.006;
    const peak = opts.isDawn ? 0.16 : 0.14;
    const decay = opts.isDawn ? 2.4 : 1.9;

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(peak, now + attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.0004, now + decay);

    // Gentle per-voice tone shaping.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1200 + northBright * 4200 + (opts.isDawn ? 0 : -200);
    tone.Q.value = 0.6;

    voiceGain.connect(tone);
    tone.connect(panner);
    panner.connect(this.voiceBus);

    // Partials — a bell-ish inharmonic-ish stack; upper ones louder up north.
    const partials = [
      { mult: 1, gain: 1.0 },
      { mult: 2.01, gain: 0.5 },
      { mult: 3.0, gain: 0.24 * (0.4 + northBright) },
      { mult: 4.2, gain: 0.14 * (0.3 + northBright) },
      { mult: 5.4, gain: 0.08 * northBright },
    ];

    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = opts.isDawn ? "triangle" : "sine";
      osc.frequency.value = freq * p.mult;
      const g = ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g).connect(voiceGain);
      osc.start(now);
      osc.stop(now + decay + 0.2);
    }
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.setTargetAtTime(0.0001, now, 0.15);
    } catch {
      // ignore
    }
    const stop = (o: OscillatorNode | null) => {
      if (!o) return;
      try {
        o.stop(now + 0.4);
      } catch {
        // ignore
      }
    };
    stop(this.droneOscA);
    stop(this.droneOscB);
    stop(this.droneSub);
  }
}
