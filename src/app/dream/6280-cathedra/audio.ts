// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the generative score (Web Audio), driven by the tension curve.
//
//   Layers, all sharing one master variable T:
//     · a slow evolving choral/organ PAD — a pool of detuned oscillators glided
//       between chord tones through a lowpass whose cutoff tracks tension;
//     · a SUB drone under everything;
//     · sparse struck BELL/piano notes (FM, soft attack) arpeggiating the
//       current chord, denser and higher as tension climbs;
//     · a high SHIMMER that swells only at the Breakthrough.
//   Everything runs into a code-generated convolution reverb (a long cathedral
//   tail) and a limiter. Master gain ≈ 0.16.
//
//   Nothing here uses Math.random()/Date.now(); all "chance" is seeded, all
//   timing comes from the AudioContext clock. If a file is dropped, the file
//   plays through an AnalyserNode and the generative bed ducks beneath it.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, clamp, lerp } from "./prng";
import { selectChord, mtof, type Chord } from "./score";
import type { Frame } from "./engine";

const MASTER = 0.16;

interface PadVoice {
  a: OscillatorNode;
  b: OscillatorNode;
  gain: GainNode;
}

export class ScoreAudio {
  private ctx: AudioContext;
  private rng: () => number;

  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private dry: GainNode;
  private wet: GainNode;
  private convolver: ConvolverNode;

  private genGain: GainNode; // generative bed bus
  private padFilter: BiquadFilterNode;
  private padGain: GainNode;
  private voices: PadVoice[] = [];
  private sub: OscillatorNode;
  private subGain: GainNode;
  private shimmerGain: GainNode;
  private shimmer: OscillatorNode[] = [];

  // dropped-file path
  private fileGain: GainNode;
  private analyser: AnalyserNode | null = null;
  private fileSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array | null = null;
  private lastSpectrum: Float32Array | null = null;

  private frame: Frame | null = null;
  private chord: Chord;
  private chordKey = "";
  private nextNote = 0;

  constructor(seed: number) {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    this.rng = mulberry32(seed ^ 0x51ed270b);
    const now = this.ctx.currentTime;

    // ── master chain: bus → masterGain → limiter → destination ──
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = MASTER;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.72;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.9;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.makeImpulse(4.2);
    this.dry.connect(this.masterGain);
    this.convolver.connect(this.wet);
    this.wet.connect(this.masterGain);

    // ── generative bed bus ──
    this.genGain = this.ctx.createGain();
    this.genGain.gain.value = 1;
    this.genGain.connect(this.dry);
    this.genGain.connect(this.convolver);

    // pad
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 400;
    this.padFilter.Q.value = 0.6;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.genGain);

    this.chord = selectChord(0);

    for (let i = 0; i < 4; i++) {
      const a = this.ctx.createOscillator();
      const b = this.ctx.createOscillator();
      a.type = "sawtooth";
      b.type = "triangle";
      b.detune.value = 6 + this.rng() * 6;
      a.detune.value = -(6 + this.rng() * 6);
      const g = this.ctx.createGain();
      g.gain.value = 0.16;
      a.connect(g);
      b.connect(g);
      g.connect(this.padFilter);
      const f = mtof(this.chord.pad[i % this.chord.pad.length]);
      a.frequency.value = f;
      b.frequency.value = f;
      a.start(now);
      b.start(now);
      this.voices.push({ a, b, gain: g });
    }

    // sub drone
    this.sub = this.ctx.createOscillator();
    this.sub.type = "sine";
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.0001;
    this.sub.frequency.value = mtof(this.chord.sub);
    this.sub.connect(this.subGain);
    this.subGain.connect(this.genGain); // through the bed bus (dry-heavy, ducks with the mix)
    this.sub.start(now);

    // shimmer (breakthrough glare)
    this.shimmerGain = this.ctx.createGain();
    this.shimmerGain.gain.value = 0.0001;
    this.shimmerGain.connect(this.convolver);
    this.shimmerGain.connect(this.genGain);
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = mtof(84 + i * 7);
      o.detune.value = (this.rng() - 0.5) * 10;
      o.connect(this.shimmerGain);
      o.start(now);
      this.shimmer.push(o);
    }

    // dropped-file path
    this.fileGain = this.ctx.createGain();
    this.fileGain.gain.value = 1;
    this.fileGain.connect(this.dry);
    this.fileGain.connect(this.convolver);

    this.nextNote = now + 0.2;
  }

  /** A long, seeded cathedral-tail impulse response. */
  private makeImpulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // slow onset bloom + long exponential decay = stone reverberance
        const env = Math.pow(1 - t, 2.4) * (0.6 + 0.4 * Math.min(1, t * 12));
        data[i] = (this.rng() * 2 - 1) * env;
      }
    }
    return buf;
  }

  /** Resume a suspended context (call on first user gesture). */
  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  contextState(): AudioContextState {
    return this.ctx.state;
  }

  now(): number {
    return this.ctx.currentTime;
  }

  /** Push this frame's tension into every parameter target. */
  setFrame(frame: Frame): void {
    this.frame = frame;
    const now = this.ctx.currentTime;
    const T = frame.harmonicTension;

    // choose / glide the chord
    const chord = selectChord(T);
    const key = chord.pad.join(",");
    if (key !== this.chordKey) {
      this.chordKey = key;
      this.chord = chord;
      const tc = 1.6; // slow glide between harmonic bands
      for (let i = 0; i < this.voices.length; i++) {
        const f = mtof(chord.pad[i % chord.pad.length]);
        this.voices[i].a.frequency.setTargetAtTime(f, now, tc);
        this.voices[i].b.frequency.setTargetAtTime(f, now, tc);
      }
      this.sub.frequency.setTargetAtTime(mtof(chord.sub), now, tc);
    }

    // lowpass opens with brightness/tension
    const cutoff = 320 + this.chord.brightness * 3600 + T * 900;
    this.padFilter.frequency.setTargetAtTime(cutoff, now, 0.4);

    // pad swells toward the breakthrough
    const padTarget = frame.live
      ? 0.05
      : lerp(0.1, 0.34, clamp(frame.lightIntensity, 0, 1));
    this.padGain.gain.setTargetAtTime(padTarget, now, 0.6);

    // sub is present low, recedes a touch at the brightest peak
    const subTarget = frame.live ? 0.04 : lerp(0.12, 0.05, frame.breakthroughness);
    this.subGain.gain.setTargetAtTime(subTarget, now, 0.7);

    // shimmer only at the climax
    const shimTarget = frame.live ? 0 : frame.breakthroughness * 0.09;
    this.shimmerGain.gain.setTargetAtTime(shimTarget, now, 0.5);

    // duck the generative bed under a dropped file
    this.genGain.gain.setTargetAtTime(frame.live ? 0.18 : 1, now, 0.5);
  }

  /** Lookahead scheduler for the struck bell/piano voice. Call each frame. */
  tick(): void {
    if (!this.frame || this.frame.live) return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.2;
    const density = this.chord.density;
    // faster grid as the music intensifies
    const step = lerp(0.46, 0.19, clamp(density, 0, 1));
    while (this.nextNote < horizon) {
      // probabilistic strike — sparse in the Narthex, a shower at the peak
      if (this.rng() < 0.35 + density * 0.55) {
        this.strike(this.nextNote);
      }
      this.nextNote += step;
    }
  }

  private strike(when: number): void {
    if (!this.frame) return;
    const pool = this.chord.bell;
    const midi = pool[Math.floor(this.rng() * pool.length)];
    const f = mtof(midi);

    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = f;

    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * (this.rng() < 0.5 ? 2 : 3);
    const modGain = this.ctx.createGain();
    // brighter FM index at higher tension → more bell-like sparkle
    modGain.gain.value = f * lerp(0.4, 1.6, this.frame.T);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const env = this.ctx.createGain();
    const peak = lerp(0.06, 0.16, this.frame.lightIntensity) * (0.6 + this.rng() * 0.4);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(peak, when + 0.03); // soft attack
    env.gain.exponentialRampToValueAtTime(0.0001, when + 2.6); // long tail

    carrier.connect(env);
    env.connect(this.genGain);
    env.connect(this.convolver);

    carrier.start(when);
    mod.start(when);
    carrier.stop(when + 2.8);
    mod.stop(when + 2.8);
    const cleanup = () => {
      carrier.disconnect();
      mod.disconnect();
      modGain.disconnect();
      env.disconnect();
    };
    carrier.onended = cleanup;
  }

  // ── dropped-file path ───────────────────────────────────────────────────────

  async loadFile(data: ArrayBuffer): Promise<void> {
    const buffer = await this.ctx.decodeAudioData(data);
    if (this.fileSource) {
      try {
        this.fileSource.stop();
      } catch {
        /* already stopped */
      }
      this.fileSource.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    analyser.connect(this.fileGain);

    this.analyser = analyser;
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.lastSpectrum = new Float32Array(analyser.frequencyBinCount);
    this.fileSource = src;
    src.start();
  }

  hasFile(): boolean {
    return this.fileSource !== null;
  }

  /**
   * Live tension proxy from the dropped file: a blend of RMS energy, spectral
   * centroid (brightness) and spectral flux (change). Returns null if no file.
   */
  getLiveTension(): number | null {
    if (!this.analyser || !this.freqData || !this.lastSpectrum) return null;
    const a = this.analyser;
    const data = this.freqData;
    a.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
    const n = data.length;

    let sum = 0;
    let weighted = 0;
    let flux = 0;
    for (let i = 0; i < n; i++) {
      const v = data[i] / 255;
      sum += v;
      weighted += v * i;
      const d = v - this.lastSpectrum[i];
      if (d > 0) flux += d;
      this.lastSpectrum[i] = v;
    }
    const rms = sum / n; // rough energy
    const centroid = sum > 0 ? weighted / (sum * n) : 0; // 0..1 brightness
    const fluxN = clamp(flux / (n * 0.25), 0, 1);

    const tension = clamp(rms * 2.2 * 0.55 + centroid * 0.3 + fluxN * 0.15, 0, 1);
    return tension;
  }

  dispose(): void {
    try {
      this.voices.forEach((v) => {
        v.a.stop();
        v.b.stop();
      });
      this.sub.stop();
      this.shimmer.forEach((o) => o.stop());
      if (this.fileSource) this.fileSource.stop();
    } catch {
      /* nodes may already be stopped */
    }
    void this.ctx.close();
  }
}
