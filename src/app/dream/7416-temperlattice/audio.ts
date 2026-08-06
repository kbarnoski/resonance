/**
 * 7416 · Temperlattice — spectral-morph additive synth (cycle 3).
 *
 * Each held note is N sine partials placed at the CURRENT spectrum's ratios and
 * amplitudes, so what you HEAR is exactly the timbre the dissonance curve is
 * computed from — play a derived scale degree and it sits in a valley of that
 * curve. Polyphony is capped at 10 voices with oldest-steal, through a
 * DynamicsCompressor limiter, master gain ≤ 0.18.
 *
 * The cycle-3 signature verb — ADAPTIVE JI — lives here as `glide`: when exactly
 * two notes are held, the page glides the newer voice's fundamental toward the
 * live curve's nearest valley to the held interval every frame via
 * setTargetAtTime, and every partial follows because it is pinned to that
 * fundamental.
 */

import type { Spectrum } from "./dissonance";

interface VoicePartial {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
}

interface Voice {
  id: number;
  partials: VoicePartial[];
  gain: GainNode;
  fund: number;
  startedAt: number;
}

const MAX_VOICES = 10;

export class TemperAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private voices = new Map<number, Voice>();
  private nextId = 1;
  private spectrum: Spectrum;

  constructor(initial: Spectrum) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("no-audiocontext");
    this.ctx = new Ctor();
    this.spectrum = initial;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.comp.connect(this.master).connect(this.ctx.destination);
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  /** Swap the live spectrum; new notes are built from it. */
  setSpectrum(spec: Spectrum): void {
    this.spectrum = spec;
  }

  private steal(): void {
    if (this.voices.size < MAX_VOICES) return;
    let oldest: Voice | null = null;
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v;
    }
    if (oldest) this.noteOff(oldest.id, 0.05);
  }

  noteOn(freq: number, velocity = 0.9): number {
    this.steal();
    const spec = this.spectrum;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.02, velocity * 0.2),
      t + 0.02,
    );
    gain.connect(this.comp);

    let ampSum = 0;
    for (const a of spec.amps) ampSum += a;
    const inv = ampSum > 0 ? 1 / ampSum : 1;

    const partials: VoicePartial[] = [];
    for (let i = 0; i < spec.ratios.length; i++) {
      const a = spec.amps[i];
      if (a <= 0.0005) continue;
      const f = freq * spec.ratios[i];
      if (!isFinite(f) || f <= 0 || f > 20000) continue;
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t);
      const pg = this.ctx.createGain();
      pg.gain.value = a * inv;
      osc.connect(pg).connect(gain);
      osc.start(t);
      partials.push({ osc, gain: pg, ratio: spec.ratios[i] });
    }
    const id = this.nextId++;
    this.voices.set(id, { id, partials, gain, fund: freq, startedAt: t });
    return id;
  }

  noteOff(id: number, release = 0.4): void {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + release);
    for (const p of v.partials) p.osc.stop(t + release + 0.05);
    this.voices.delete(id);
  }

  /**
   * ADAPTIVE JI — glide a held voice's fundamental toward `freq`. Every partial
   * follows because it is pinned to fundamental * ratio.
   */
  glide(id: number, freq: number, tau = 0.08): void {
    const v = this.voices.get(id);
    if (!v || !isFinite(freq) || freq <= 0) return;
    v.fund = freq;
    const t = this.ctx.currentTime;
    for (const p of v.partials) {
      const f = freq * p.ratio;
      if (f > 0 && f < 20000) p.osc.frequency.setTargetAtTime(f, t, tau);
    }
  }

  /** A degree that releases itself — used by the auto-demo phrase. */
  pluck(freq: number, velocity = 0.75, dur = 0.55): void {
    const id = this.noteOn(freq, velocity);
    const v = this.voices.get(id);
    if (v) {
      const t = this.ctx.currentTime;
      v.gain.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur * 0.35);
      for (const p of v.partials) p.osc.stop(t + dur + 0.2);
      this.voices.delete(id);
    }
  }

  dispose(): void {
    const t = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        for (const p of v.partials) p.osc.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    try {
      this.comp.disconnect();
      this.master.disconnect();
    } catch {
      /* already disconnected */
    }
    void this.ctx.close();
  }
}
