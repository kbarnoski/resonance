// 2100-veil-cathedral — audio engine.
//
// A seeded generative ambient-piano carrier (soft-attack / long-release voices
// over a detuned drone bed) that self-plays with zero input, plus an optional
// dropped audio file decoded via decodeAudioData. BOTH route through the SAME
// AnalyserNode so whichever is sounding drives the volumetric field.
//
// Master chain:
//   carrierBus ┐
//   fileBus    ┴─▶ mixBus ─▶ analyser ─▶ compressor(limiter) ─▶ master ─▶ out
//
// The master gain does a ~1.5 s exponential fade-in and the compressor keeps
// peaks in check, so the level never runs away even on a loud dropped track.

import { mulberry32, VEIL_SEED } from "./prng";

export interface Bands {
  /** deep volume swell */ bass: number;
  /** mid-shell shimmer */ mid: number;
  /** sparkle / aura */ high: number;
  /** overall loudness 0..1 */ level: number;
}

// Minor-pentatonic degrees (semitones) — calm, no leading-tone tension.
const PENTA = [0, 3, 5, 7, 10];
const ROOT_HZ = 130.81; // C3

function midiRatio(semi: number): number {
  return Math.pow(2, semi / 12);
}

export class VeilAudio {
  private ctx: AudioContext;
  private rand: () => number;

  private mixBus: GainNode;
  private carrierBus: GainNode;
  private fileBus: GainNode;
  private analyser: AnalyserNode;
  private compressor: DynamicsCompressorNode;
  private master: GainNode;

  private freq: Uint8Array<ArrayBuffer>;

  // Generative-carrier scheduler state (driven off ctx.currentTime).
  private nextNoteTime = 0;
  private droneNodes: OscillatorNode[] = [];
  private started = false;

  // Smoothed band envelopes (EMA) so the visuals never jitter frame-to-frame.
  private eBass = 0;
  private eMid = 0;
  private eHigh = 0;
  private eLevel = 0;

  // File playback.
  private fileSource: AudioBufferSourceNode | null = null;
  private fileActive = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.rand = mulberry32(VEIL_SEED);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    this.mixBus = ctx.createGain();
    this.mixBus.gain.value = 1;

    this.carrierBus = ctx.createGain();
    this.carrierBus.gain.value = 0.9;
    this.fileBus = ctx.createGain();
    this.fileBus.gain.value = 0;

    // Wire the chain.
    this.carrierBus.connect(this.mixBus);
    this.fileBus.connect(this.mixBus);
    this.mixBus.connect(this.analyser);
    this.analyser.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);
  }

  /** Begin sound: fade master in, light the drone bed, arm the scheduler. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;

    // Exponential fade-in over ~1.5 s, peak ≤ 0.85.
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.85, t + 1.5);

    this.buildDrone();
    this.nextNoteTime = t + 0.4;
  }

  private buildDrone(): void {
    const t = this.ctx.currentTime;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.22;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    lp.Q.value = 0.6;

    // Slow filter LFO for a breathing pad, well under any flicker band.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start(t);
    this.droneNodes.push(lfo);

    // Root, octave-down, and fifth — gently detuned sines/triangles.
    const partials: Array<[number, OscillatorType, number]> = [
      [ROOT_HZ / 2, "sine", 0],
      [ROOT_HZ / 2, "sine", 5],
      [ROOT_HZ, "triangle", -4],
      [ROOT_HZ * midiRatio(7), "sine", 3],
    ];
    for (const [hz, type, detune] of partials) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(lp);
      o.start(t);
      this.droneNodes.push(o);
    }
    lp.connect(droneGain).connect(this.carrierBus);
  }

  /**
   * Advance the generative carrier. Call once per animation frame; it schedules
   * notes a short lookahead ahead of ctx.currentTime, so timing is sample-clock
   * accurate and independent of frame rate. No-op once a file has taken over.
   */
  schedule(): void {
    if (!this.started || this.fileActive) return;
    const lookahead = 0.6;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.scheduleNote(this.nextNoteTime);
      // Deterministic, breathing rhythm: mostly slow, occasional rests/pairs.
      const r = this.rand();
      let step = 0.85;
      if (r < 0.18) step = 1.7; // a held space
      else if (r < 0.42) step = 0.42; // a closer pair
      this.nextNoteTime += step;
    }
  }

  private scheduleNote(when: number): void {
    const degree = PENTA[Math.floor(this.rand() * PENTA.length)];
    const octave = Math.floor(this.rand() * 3); // 0..2
    const hz = ROOT_HZ * midiRatio(degree + 12 * octave);
    const vel = 0.045 + this.rand() * 0.05;

    // Soft-attack / long-release voice: a warm triangle + a faint octave sine.
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400 + this.rand() * 900;
    lp.Q.value = 0.4;

    const o1 = this.ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = hz;
    o1.detune.value = (this.rand() - 0.5) * 8;

    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz * 2;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.35;

    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(lp).connect(this.carrierBus);

    // Envelope: gentle attack, long tail — never a struck/percussive click.
    const atk = 0.09;
    const rel = 2.6 + this.rand() * 1.6;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vel, when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + atk + rel);

    o1.start(when);
    o2.start(when);
    const stop = when + atk + rel + 0.1;
    o1.stop(stop);
    o2.stop(stop);
  }

  /** Decode a dropped file and route it through the same analyser; duck carrier. */
  async playFile(data: ArrayBuffer): Promise<void> {
    const buffer = await this.ctx.decodeAudioData(data);
    const t = this.ctx.currentTime;

    // Stop any prior file.
    if (this.fileSource) {
      try {
        this.fileSource.stop();
      } catch {
        /* already stopped */
      }
      this.fileSource.disconnect();
      this.fileSource = null;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.fileBus);

    // Cross-duck: carrier down, file up (~1.2 s).
    this.fileBus.gain.cancelScheduledValues(t);
    this.fileBus.gain.setValueAtTime(Math.max(0.0001, this.fileBus.gain.value), t);
    this.fileBus.gain.linearRampToValueAtTime(0.95, t + 1.2);
    this.carrierBus.gain.cancelScheduledValues(t);
    this.carrierBus.gain.setValueAtTime(this.carrierBus.gain.value, t);
    this.carrierBus.gain.linearRampToValueAtTime(0.05, t + 1.2);

    src.start(t);
    this.fileSource = src;
    this.fileActive = true;
  }

  /** Read + smooth the spectrum into three musical bands. */
  getBands(): Bands {
    this.analyser.getByteFrequencyData(this.freq);
    const n = this.freq.length;
    const band = (lo: number, hi: number): number => {
      let s = 0;
      const a = Math.max(1, Math.floor(lo));
      const b = Math.min(n, Math.floor(hi));
      for (let i = a; i < b; i++) s += this.freq[i];
      return b > a ? s / (b - a) / 255 : 0;
    };
    // FFT bins: ~21.5 Hz each at 44.1k/2048.
    const bass = band(1, 8);
    const mid = band(8, 46);
    const high = band(46, 150);
    const level = (bass + mid + high) / 3;

    // Asymmetric EMA — quick rise, slow fall — for a lively but non-strobing read.
    const ease = (env: number, v: number): number =>
      v > env ? env + (v - env) * 0.35 : env + (v - env) * 0.08;
    this.eBass = ease(this.eBass, bass);
    this.eMid = ease(this.eMid, mid);
    this.eHigh = ease(this.eHigh, high);
    this.eLevel = ease(this.eLevel, level);

    return { bass: this.eBass, mid: this.eMid, high: this.eHigh, level: this.eLevel };
  }

  get currentTime(): number {
    return this.ctx.currentTime;
  }

  /** Full teardown. */
  dispose(): void {
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    } catch {
      /* ctx may be closing */
    }
    for (const o of this.droneNodes) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    this.droneNodes = [];
    if (this.fileSource) {
      try {
        this.fileSource.stop();
      } catch {
        /* already stopped */
      }
      this.fileSource.disconnect();
      this.fileSource = null;
    }
  }
}
