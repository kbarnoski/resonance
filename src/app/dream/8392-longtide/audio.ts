// 8392-longtide · audio.ts
// A self-contained Web Audio graph:
//   • a procedural warm-piano CARRIER rendered into an AudioBuffer,
//   • a GRANULAR engine (overlapping Hann grains from a moving read-head),
//   • a just-intonation DRONE bed,
//   • an AnalyserNode whose amplitude + spectral centroid FORCE the visuals,
//   • memory replay: short-term echoes on plant, long-term Recollection replay
//     (time-stretched, up a fifth).
// Master DynamicsCompressor limiter. Carrier can be replaced by a dropped file.

import { clamp } from "./util";
import type { Seed } from "./memory";

const CARRIER_SEC = 14;
const HANN_N = 160;

// Per-movement granular character.
const DENSITY = [7, 14, 22, 12, 6]; // grains / second
const GRAIN_SIZE = [0.22, 0.16, 0.1, 0.28, 0.34]; // seconds
const PITCH_SEMI = [0, 0, 2, 0, -12]; // base grain transposition
const READ_SPEED = [0.012, 0.02, 0.035, 0.015, 0.01]; // buffer fraction / sec
const DRONE_LEVEL = [0.14, 0.12, 0.09, 0.11, 0.16];
const GRAIN_GAIN = [0.5, 0.55, 0.5, 0.5, 0.45];

export interface AudioFeatures {
  amp: number;
  centroid: number;
}

export class LongtideAudio {
  private ctx: AudioContext;
  private reduced: boolean;

  private carrier: AudioBuffer;
  private grainBus: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private convolver: ConvolverNode;
  private droneGain: GainNode;
  private master: GainNode;
  private analyser: AnalyserNode;

  private droneOscs: OscillatorNode[] = [];
  private started = false;

  private readHead = 0;
  private nextGrainTime = 0;
  private movement = 0;

  private hann: Float32Array;
  private freqData: Uint8Array<ArrayBuffer>;
  private smAmp = 0;
  private smCentroid = 0.3;

  private live = new Set<AudioBufferSourceNode>();

  constructor(reduced: boolean) {
    this.reduced = reduced;
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.hann = new Float32Array(HANN_N);
    for (let i = 0; i < HANN_N; i++) {
      this.hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (HANN_N - 1));
    }

    this.carrier = this.renderCarrier();

    // ── graph ────────────────────────────────────────────────────────────────
    const ctx = this.ctx;
    this.grainBus = ctx.createGain();
    this.grainBus.gain.value = 1;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.85;
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.5;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.renderReverbIR();

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = DRONE_LEVEL[0];

    this.master = ctx.createGain();
    this.master.gain.value = 0.25; // limiter make-up / master trim

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.7;
    this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    // grains -> dry + convolver(wet) -> master
    this.grainBus.connect(this.dryGain).connect(this.master);
    this.grainBus.connect(this.convolver).connect(this.wetGain).connect(this.master);
    // drone -> master
    this.droneGain.connect(this.master);
    // master -> limiter -> analyser -> out
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);
  }

  // ── carrier synthesis: struck warm-piano phrase in D dorian / pentatonic ────
  private renderCarrier(): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(CARRIER_SEC * sr);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);

    // pentatonic D-dorian pool across two octaves (D E G A C)
    const notes = [
      146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25,
    ];
    let seed = 0x8392abcd >>> 0;
    const rnd = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 100000) / 100000;
    };

    let t = 0.2;
    while (t < CARRIER_SEC - 1.5) {
      const f0 = notes[Math.floor(rnd() * notes.length)];
      const dur = 1.6 + rnd() * 2.2; // long decay
      const amp = 0.5 + rnd() * 0.4;
      const start = Math.floor(t * sr);
      const nSamp = Math.min(Math.floor(dur * sr), len - start);
      // struck partials: fundamental + detuned overtones
      const partials = [1, 2, 3, 4, 5];
      const decayTau = dur * 0.42;
      for (let s = 0; s < nSamp; s++) {
        const time = s / sr;
        // fast attack, long exponential decay
        const env = (1 - Math.exp(-time * 500)) * Math.exp(-time / decayTau);
        let v = 0;
        for (let p = 0; p < partials.length; p++) {
          const pn = partials[p];
          const detune = 1 + (pn - 1) * 0.0009; // inharmonicity
          const pa = 1 / (pn * pn);
          v += pa * Math.sin(2 * Math.PI * f0 * pn * detune * time);
        }
        data[start + s] += amp * env * v * 0.5;
      }
      t += 0.55 + rnd() * 0.7; // overlapping notes
    }

    // normalise
    let peak = 1e-4;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
    const g = 0.92 / peak;
    for (let i = 0; i < len; i++) data[i] *= g;
    return buf;
  }

  private renderReverbIR(): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 2.2);
    const ir = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.4);
        d[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return ir;
  }

  /** Resume the context and start the drone (call from a user gesture / load). */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — will retry on next gesture */
      }
    }
    if (this.started || this.ctx.state !== "running") return;
    this.started = true;
    this.nextGrainTime = this.ctx.currentTime + 0.08;

    // just-intonation drone bed on D2 (1, 5/4, 3/2, 2/1)
    const base = 73.42;
    const ratios = [1, 1.25, 1.5, 2];
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.connect(this.droneGain);
    for (let i = 0; i < ratios.length; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? "triangle" : "sine";
      o.frequency.value = base * ratios[i];
      o.detune.value = (i - 1.5) * 4;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.28 / i;
      o.connect(g).connect(lp);
      o.start();
      this.droneOscs.push(o);
    }
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  setMovement(m: number): void {
    this.movement = clamp(m, 0, 4);
    const now = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(DRONE_LEVEL[this.movement], now, 1.5);
  }

  /** Current read-head position (0..1) — the window a plant captures. */
  get readWindow(): number {
    return this.readHead;
  }

  // ── grain scheduling ────────────────────────────────────────────────────────
  private scheduleGrain(
    when: number,
    window: number,
    pitchRate: number,
    grainDur: number,
    gain: number,
    pan: number,
  ): void {
    if (this.ctx.state !== "running") return;
    const dur = this.carrier.duration;
    let offset = window * dur;
    offset = clamp(offset, 0, Math.max(0, dur - grainDur * pitchRate - 0.02));

    const src = this.ctx.createBufferSource();
    src.buffer = this.carrier;
    src.playbackRate.value = pitchRate;

    const g = this.ctx.createGain();
    const env = new Float32Array(HANN_N);
    for (let i = 0; i < HANN_N; i++) env[i] = this.hann[i] * gain;
    try {
      g.gain.setValueCurveAtTime(env, when, grainDur);
    } catch {
      g.gain.value = 0;
    }

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);

    src.connect(g).connect(panner).connect(this.grainBus);
    src.start(when, offset, grainDur * pitchRate + 0.02);
    src.stop(when + grainDur + 0.05);
    this.live.add(src);
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
      g.disconnect();
      panner.disconnect();
    };
  }

  /** Schedule the running granular stream up to `now + lookahead`. */
  tick(): void {
    if (this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const m = this.movement;
    const density = DENSITY[m] * (this.reduced ? 0.7 : 1);
    const interval = 1 / density;
    const grainDur = GRAIN_SIZE[m];
    const rate = Math.pow(2, PITCH_SEMI[m] / 12);
    const gain = GRAIN_GAIN[m];
    const speed = READ_SPEED[m];
    const lookahead = 0.12;

    if (this.nextGrainTime < now) this.nextGrainTime = now + 0.02;
    while (this.nextGrainTime < now + lookahead) {
      const jitterWin = clamp(this.readHead + (Math.random() - 0.5) * 0.02, 0, 1);
      const pan = (Math.random() - 0.5) * 1.2;
      this.scheduleGrain(this.nextGrainTime, jitterWin, rate, grainDur, gain, pan);
      // read-head crawls forward, wrapping
      this.readHead = (this.readHead + speed * interval) % 1;
      this.nextGrainTime += interval;
    }
  }

  /** Schedule a fixed burst of grains around a window (used by memory replay). */
  private scheduleBurst(
    window: number,
    startTime: number,
    pitchRate: number,
    gain: number,
    grainDur: number,
    count: number,
    spread: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const when = startTime + (i / count) * spread;
      const w = clamp(window + i * 0.008, 0, 1); // slight advance = time-stretch
      const decay = gain * (1 - (i / count) * 0.4);
      const pan = Math.sin(i * 1.7) * 0.7;
      this.scheduleGrain(when, w, pitchRate, grainDur, decay, pan);
    }
  }

  /** Plant: capture the current window and echo it locally (a soft canon). */
  plantSeed(): number {
    const win = this.readHead;
    if (this.ctx.state === "running") {
      const t0 = this.ctx.currentTime + 0.02;
      // the phrase, then two decaying echoes
      this.scheduleBurst(win, t0, 1, 0.5, 0.14, 3, 0.25);
      this.scheduleBurst(win, t0 + 0.4, 1, 0.28, 0.16, 3, 0.28);
      this.scheduleBurst(win, t0 + 0.85, 1, 0.16, 0.18, 3, 0.3);
    }
    return win;
  }

  /** Recollection: replay a stored seed's phrase, time-stretched + up a fifth. */
  recollectSeed(seed: Seed): void {
    if (this.ctx.state !== "running") return;
    const t0 = this.ctx.currentTime + 0.03;
    const rate = 1.5 * Math.pow(2, seed.pitch / 12); // up a perfect fifth + seed pitch
    // large grains, slow spread => time-stretched
    this.scheduleBurst(seed.grainWindow, t0, rate, 0.6, 0.3, 8, 1.4);
  }

  getFeatures(): AudioFeatures {
    this.analyser.getByteFrequencyData(this.freqData);
    const n = this.freqData.length;
    let sum = 0;
    let wsum = 0;
    for (let i = 0; i < n; i++) {
      const v = this.freqData[i];
      sum += v;
      wsum += v * i;
    }
    const amp = sum / (n * 255);
    const centroid = sum > 0 ? wsum / sum / n : 0.3;
    this.smAmp += (amp - this.smAmp) * 0.2;
    this.smCentroid += (centroid - this.smCentroid) * 0.15;
    return { amp: clamp(this.smAmp * 3.2, 0, 1), centroid: clamp(this.smCentroid, 0, 1) };
  }

  /** Replace the carrier with a dropped recording. */
  async loadCarrier(arrayBuffer: ArrayBuffer): Promise<void> {
    const decoded = await this.ctx.decodeAudioData(arrayBuffer);
    this.carrier = decoded;
    this.readHead = 0;
  }

  dispose(): void {
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    for (const s of this.live) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
      s.disconnect();
    }
    this.live.clear();
    try {
      void this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
