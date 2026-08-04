// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the four-stem playback / mixer engine.
//
//   Every stem (percussive · bass · body · air) plays through the SAME graph
//   whether it came from the synthetic bed (generated on load) or from a real
//   dropped recording separated by hpss.ts:
//
//       AudioBufferSource → stemGain → stemAnalyser ┐
//                                                   ├→ sumBus → limiter → master → out
//   ...one such chain per stem. Because each analyser sits AFTER its gain,
//   muting/soloing/level changes are reflected directly in the level the visual
//   scene reads — the bodies dim and swell with the audio you actually hear.
//
//   Solo, mute and level are applied with short setTargetAtTime ramps so there
//   is never a click or a strobe. No Math.random / Date.now: the synthetic bed
//   is generated from mulberry32(0x6392).
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./prng";
import { STEM_NAMES, type SeparatedStems } from "./hpss";

type AudioCtor = typeof AudioContext;

export class StemAudio {
  readonly ctx: AudioContext;
  private readonly gains: GainNode[] = [];
  private readonly analysers: AnalyserNode[] = [];
  private readonly scratch: Float32Array<ArrayBuffer>[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private buffers: (AudioBuffer | null)[] = [null, null, null, null];
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;

  /** Smoothed 0..~1 level per stem, updated by sampleLevels(). */
  readonly levels = new Float32Array(STEM_NAMES.length);
  readonly userLevel = [1, 1, 1, 1];
  readonly muted = [false, false, false, false];
  soloIndex: number | null = null;
  /** true once real separated stems have replaced the synthetic bed. */
  isLive = false;

  constructor() {
    const Ctor: AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    for (let i = 0; i < STEM_NAMES.length; i++) {
      const g = this.ctx.createGain();
      g.gain.value = 1;
      const a = this.ctx.createAnalyser();
      a.fftSize = 1024;
      a.smoothingTimeConstant = 0.6;
      g.connect(a);
      a.connect(this.limiter);
      this.gains.push(g);
      this.analysers.push(a);
      this.scratch.push(new Float32Array(a.fftSize));
    }

    this.buffers = this.makeSyntheticBed();
    this.startSources(this.ctx.currentTime + 0.06);
    this.applyGains(0);
  }

  // ── synthetic musical bed (alive on load, zero interaction) ────────────────
  private makeSyntheticBed(): AudioBuffer[] {
    const sr = this.ctx.sampleRate;
    const dur = 12; // seconds, seamless loop
    const len = Math.floor(dur * sr);
    const rng = mulberry32(0x6392);

    const perc = new Float32Array(len);
    const bass = new Float32Array(len);
    const body = new Float32Array(len);
    const air = new Float32Array(len);

    // Just-intonation scale over a root, forming a gentle arpeggio.
    const root = 220; // A3
    const ratios = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
    const step = 0.375; // seconds between arpeggio notes
    const events = Math.floor(dur / step);

    for (let e = 0; e < events; e++) {
      const t0 = e * step;
      const deg = Math.floor(rng() * ratios.length);
      const freq = root * ratios[deg] * (rng() < 0.28 ? 2 : 1);
      const s0 = Math.floor(t0 * sr);
      // body: additive pluck (fundamental + a few partials) with decay
      const noteLen = Math.floor(1.1 * sr);
      for (let i = 0; i < noteLen && s0 + i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 3.2) * (1 - Math.exp(-t * 120));
        const ph = 2 * Math.PI * freq * t;
        const s =
          Math.sin(ph) +
          0.4 * Math.sin(2 * ph) +
          0.22 * Math.sin(3 * ph) +
          0.1 * Math.sin(5 * ph);
        body[s0 + i] += 0.16 * env * s;
      }
      // air: soft high shimmer, sparse
      if (rng() < 0.6) {
        const hf = freq * 4;
        for (let i = 0; i < noteLen && s0 + i < len; i++) {
          const t = i / sr;
          const env = Math.exp(-t * 2.0) * (1 - Math.exp(-t * 40));
          const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * 5.5 * t);
          air[s0 + i] += 0.03 * env * trem * Math.sin(2 * Math.PI * hf * t);
        }
      }
    }

    // bass: slow sub that changes root every 2 beats
    const bassStep = step * 4;
    const bassEvents = Math.floor(dur / bassStep);
    for (let e = 0; e < bassEvents; e++) {
      const deg = Math.floor(rng() * 4); // low degrees
      const freq = (root / 2) * ratios[deg];
      const s0 = Math.floor(e * bassStep * sr);
      const noteLen = Math.floor(bassStep * 1.05 * sr);
      for (let i = 0; i < noteLen && s0 + i < len; i++) {
        const t = i / sr;
        const env = Math.min(1, t * 6) * Math.exp(-t * 0.7);
        bass[s0 + i] += 0.34 * env * Math.sin(2 * Math.PI * freq * t);
      }
    }

    // percussive: brushed noise ticks on a soft rhythm (one-pole highpass)
    const tickStep = step / 2;
    const tickEvents = Math.floor(dur / tickStep);
    let hpPrev = 0;
    let hpIn = 0;
    for (let e = 0; e < tickEvents; e++) {
      if (rng() < 0.45) continue;
      const s0 = Math.floor(e * tickStep * sr);
      const tickLen = Math.floor(0.09 * sr);
      const gain = 0.12 + 0.12 * rng();
      for (let i = 0; i < tickLen && s0 + i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 55);
        const noise = rng() * 2 - 1;
        // one-pole highpass to "brush" it
        const hp = 0.85 * (hpPrev + noise - hpIn);
        hpIn = noise;
        hpPrev = hp;
        perc[s0 + i] += gain * env * hp;
      }
    }

    return [
      this.toBuffer(perc, sr),
      this.toBuffer(bass, sr),
      this.toBuffer(body, sr),
      this.toBuffer(air, sr),
    ];
  }

  private toBuffer(data: Float32Array, sr: number): AudioBuffer {
    const buf = this.ctx.createBuffer(1, data.length, sr);
    buf.getChannelData(0).set(data);
    return buf;
  }

  private startSources(when: number): void {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources = this.buffers.map((buf, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.gains[i]);
      src.start(when);
      return src;
    });
  }

  /** Decode an ArrayBuffer to a mono Float32Array + sample rate. */
  async decodeMono(data: ArrayBuffer): Promise<{ mono: Float32Array; sampleRate: number }> {
    const audio = await this.ctx.decodeAudioData(data);
    const sr = audio.sampleRate;
    const ch = audio.numberOfChannels;
    const n = audio.length;
    const mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
    }
    return { mono, sampleRate: sr };
  }

  /** Replace the synthetic bed with real separated stems. */
  loadStems(stems: SeparatedStems): void {
    const sr = stems.sampleRate;
    this.buffers = [
      this.toBuffer(stems.percussive, sr),
      this.toBuffer(stems.bass, sr),
      this.toBuffer(stems.body, sr),
      this.toBuffer(stems.air, sr),
    ];
    this.startSources(this.ctx.currentTime + 0.06);
    this.isLive = true;
    this.applyGains(0.05);
  }

  private applyGains(ramp: number): void {
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.gains.length; i++) {
      let target = this.muted[i] ? 0 : this.userLevel[i];
      if (this.soloIndex !== null && this.soloIndex !== i) target = 0;
      this.gains[i].gain.setTargetAtTime(target, now, Math.max(0.005, ramp / 3 + 0.02));
    }
  }

  toggleSolo(i: number): void {
    this.soloIndex = this.soloIndex === i ? null : i;
    this.applyGains(0.05);
  }

  toggleMute(i: number): void {
    this.muted[i] = !this.muted[i];
    this.applyGains(0.05);
  }

  setLevel(i: number, v: number): void {
    this.userLevel[i] = v;
    this.applyGains(0.03);
  }

  /** Read each analyser's RMS into `levels` (call once per frame). */
  sampleLevels(): void {
    for (let i = 0; i < this.analysers.length; i++) {
      const buf = this.scratch[i];
      this.analysers[i].getFloatTimeDomainData(buf);
      let sum = 0;
      for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
      const rms = Math.sqrt(sum / buf.length);
      // perceptual-ish curve + smoothing
      const target = Math.min(1, rms * 3.5);
      this.levels[i] += (target - this.levels[i]) * 0.35;
    }
  }

  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get suspended(): boolean {
    return this.ctx.state === "suspended";
  }

  dispose(): void {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* noop */
      }
    });
    try {
      void this.ctx.close();
    } catch {
      /* noop */
    }
  }
}
