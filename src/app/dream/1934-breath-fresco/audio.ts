/**
 * Additive just-intonation drone bank for 1934 · Breath Fresco.
 *
 * TECHNIQUE: each confirmed exhale opens ONE sustained partial over a low
 * fundamental (~60 Hz). Partials are drawn from a just-intonation ratio set, so
 * the accumulating chord stays consonant — an Éliane-Radigue-style long drone
 * that thickens as the session's fresco fills. A bounded voice pool (≤24) with
 * gentle attack/steal-release envelopes keeps it from piling up or clicking.
 *
 * Signal path: voices → voiceBus → DynamicsCompressor → masterGain (≤0.18,
 * ramped from a user gesture) → destination. Nothing autoplays loudly.
 */

import { F0, RATIOS, mulberry32 } from "./breath";

const MAX_VOICES = 24;
const MASTER_TARGET = 0.18;

interface Voice {
  osc: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  gain: GainNode;
  startedAt: number;
  releasing: boolean;
}

export class FrescoAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private bus: GainNode;
  private voices: Voice[] = [];
  private rng = mulberry32(0x1934_c0de);
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.28;

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  /** Resume the context (must be called from a user gesture) and ramp up. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(MASTER_TARGET, now + 1.6);
  }

  /** Open one sustained partial for a completed exhale. */
  openPartial(partialIndex: number, intensity: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    if (this.voices.length >= MAX_VOICES) {
      // Steal the oldest non-releasing voice.
      const victim =
        this.voices.find((v) => !v.releasing) ?? this.voices[0];
      this.release(victim);
    }

    const ratio = RATIOS[Math.max(0, Math.min(RATIOS.length - 1, partialIndex))];
    const freq = F0 * ratio;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Tiny fixed detune per voice for a living, beating drone.
    osc.detune.value = (this.rng() - 0.5) * 6;

    const gain = this.ctx.createGain();
    const level = 0.055 + 0.05 * Math.min(1, Math.max(0, intensity));
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 2.4);

    // Slow amplitude shimmer (evolving drone). Sums with the ramped base.
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.03 + this.rng() * 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = level * 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(gain);
    gain.connect(this.bus);
    osc.start(now);
    lfo.start(now);

    this.voices.push({ osc, lfo, lfoGain, gain, startedAt: now, releasing: false });
  }

  private release(v: Voice): void {
    if (v.releasing) return;
    v.releasing = true;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.setTargetAtTime(0, now, 1.6);
    try {
      v.osc.stop(now + 6);
      v.lfo.stop(now + 6);
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => {
      try {
        v.osc.disconnect();
        v.lfo.disconnect();
        v.lfoGain.disconnect();
        v.gain.disconnect();
      } catch {
        /* noop */
      }
      this.voices = this.voices.filter((x) => x !== v);
    }, 6300);
  }

  activeVoices(): number {
    return this.voices.filter((v) => !v.releasing).length;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.4);
    } catch {
      /* noop */
    }
    this.voices.forEach((v) => {
      try {
        v.osc.stop(now + 0.5);
        v.lfo.stop(now + 0.5);
      } catch {
        /* noop */
      }
    });
    this.voices = [];
    window.setTimeout(() => {
      void this.ctx.close();
    }, 600);
  }
}
