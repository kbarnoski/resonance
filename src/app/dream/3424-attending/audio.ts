// ════════════════════════════════════════════════════════════════════════════
// 3424 — attending · the audio engine
//
// One soft voice per glyph. Each voice is a 2-partial additive sine (fundamental
// + a gently detuned twin, for slow beating warmth). A voice's gain is a quiet
// hum-FLOOR plus bloom × fuller — so every glyph always hums, and blooming only
// ever thickens the shared drone. Gains ramp smoothly (setTargetAtTime) so there
// are never clicks. A slow LFO drifts the master lowpass for an evolving pad.
// ════════════════════════════════════════════════════════════════════════════

import type { Glyph } from "./field";

const HUM_FLOOR = 0.006;
const FULLER = 0.045;
const MASTER_LEVEL = 0.28;

/* eslint-disable @typescript-eslint/no-explicit-any */
function getAudioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as any).webkitAudioContext || null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class AttendingAudio {
  readonly available: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private voiceGains: GainNode[] = [];
  private lfo: OscillatorNode | null = null;
  private started = false;
  private muted = false;

  constructor() {
    this.available = getAudioCtor() !== null;
  }

  /** Build and start the whole field of voices. Returns true if audio is live. */
  start(freqs: number[], detunes: number[]): boolean {
    if (this.started || !this.available) return this.started;
    const Ctor = getAudioCtor();
    if (!Ctor) return false;

    const ctx = new Ctor();
    this.ctx = ctx;

    // A gentle limiter guarantees the summed field never clips harshly.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);
    this.master = master;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1350;
    filter.Q.value = 0.4;
    filter.connect(master);

    // Slow LFO drifting the cutoff — a drone that never sits still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 480;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.lfo = lfo;

    for (let i = 0; i < freqs.length; i++) {
      const g = ctx.createGain();
      g.gain.value = HUM_FLOOR;
      g.connect(filter);
      this.voiceGains.push(g);

      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = freqs[i];
      o1.connect(g);
      o1.start();
      this.oscillators.push(o1);

      // Detuned twin at half level for a slow, consonant beating.
      const twinGain = ctx.createGain();
      twinGain.gain.value = 0.5;
      twinGain.connect(g);
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freqs[i];
      o2.detune.value = detunes[i];
      o2.connect(twinGain);
      o2.start();
      this.oscillators.push(o2);
    }

    const t = ctx.currentTime;
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(MASTER_LEVEL, t + 2.5);

    this.started = true;
    return true;
  }

  /** Each frame: nudge every voice's gain toward floor + bloom·fuller. */
  update(glyphs: Glyph[]): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.voiceGains.length; i++) {
      const target = HUM_FLOOR + glyphs[i].bloom * FULLER;
      this.voiceGains[i].gain.setTargetAtTime(target, t, 0.4);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0 : MASTER_LEVEL, t, 0.3);
  }

  async dispose(): Promise<void> {
    try {
      this.lfo?.stop();
      for (const o of this.oscillators) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      if (this.ctx) await this.ctx.close();
    } catch {
      /* ignore teardown races */
    }
    this.ctx = null;
    this.master = null;
    this.oscillators = [];
    this.voiceGains = [];
    this.lfo = null;
    this.started = false;
  }
}
