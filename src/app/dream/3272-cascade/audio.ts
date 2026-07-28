// Web Audio engine for Cascade. Each bar is a short struck-modal voice
// (inharmonic partials + a filtered mallet tick) with a fast, pitch-dependent
// decay. A voice pool caps polyphony and a per-bar retrigger cooldown keeps a
// dense particle stream from machine-gunning. Everything sums through a limiter.

import { BAR_MIDI } from "./sim";

const MAX_VOICES = 26;
const COOLDOWN = 0.05; // s, per bar
const PARTIALS: Array<[number, number]> = [
  [1, 1],
  [2.76, 0.3],
  [5.4, 0.12],
];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

type WindowWithWebkit = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export class CascadeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly freqs: number[] = BAR_MIDI.map(midiToFreq);
  private readonly lastHit: number[] = BAR_MIDI.map(() => -1);
  private active = 0;

  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const w = window as WindowWithWebkit;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    // one-shot white-noise buffer for the mallet tick
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.noise = noise;
  }

  /** Strike bar `j`. `strength` in ~[0,1] scales level. */
  trigger(j: number, strength = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (j < 0 || j >= this.freqs.length) return;
    const now = ctx.currentTime;
    if (now - this.lastHit[j] < COOLDOWN) return;
    if (this.active >= MAX_VOICES) return;
    this.lastHit[j] = now;

    const freq = this.freqs[j];
    const decay = 1.1 * Math.pow(0.9, j); // higher bars ring shorter
    const peak = 0.22 * Math.min(1, Math.max(0.25, strength));

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.004);
    voice.gain.exponentialRampToValueAtTime(0.0008, now + decay);
    voice.connect(master);

    const oscs: OscillatorNode[] = [];
    for (const [ratio, g] of PARTIALS) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * ratio;
      o.detune.value = (Math.random() - 0.5) * 4;
      const pg = ctx.createGain();
      pg.gain.value = g;
      o.connect(pg);
      pg.connect(voice);
      o.start(now);
      o.stop(now + decay + 0.05);
      oscs.push(o);
    }

    // mallet tick — short band-passed noise burst
    if (this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(9000, freq * 3);
      bp.Q.value = 0.8;
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(peak * 0.5, now);
      tg.gain.exponentialRampToValueAtTime(0.0004, now + 0.03);
      src.connect(bp);
      bp.connect(tg);
      tg.connect(master);
      src.start(now);
      src.stop(now + 0.06);
    }

    this.active += 1;
    oscs[0].onended = () => {
      this.active -= 1;
      voice.disconnect();
    };
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
      this.noise = null;
    }
  }
}
