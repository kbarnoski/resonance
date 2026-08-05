/**
 * 6808 · Spectrascale — additive voice built from the CURRENT spectrum.
 *
 * Each note is N sine partials placed at the drawbar ratios/amps of the live
 * timbre (stretched / inharmonic if the sliders are up). So what you HEAR is
 * exactly the spectrum the dissonance curve is computed from — play a derived
 * scale degree and it sits in a valley of that curve. Polyphony is capped at 10
 * voices with oldest-steal, a DynamicsCompressor limits, master gain ≤ 0.18.
 */

import type { Spectrum } from "./dissonance";

interface Voice {
  id: number;
  partials: OscillatorNode[];
  gain: GainNode;
  startedAt: number;
}

const MAX_VOICES = 10;

export class SpectraAudio {
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

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Swap the live spectrum; new notes are built from it. */
  setSpectrum(spec: Spectrum) {
    this.spectrum = spec;
  }

  private steal() {
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

    // normalise partial loudness so dense/odd spectra don't clip.
    let ampSum = 0;
    for (const a of spec.amps) ampSum += a;
    const inv = ampSum > 0 ? 1 / ampSum : 1;

    const partials: OscillatorNode[] = [];
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
      partials.push(osc);
    }
    const id = this.nextId++;
    this.voices.set(id, { id, partials, gain, startedAt: t });
    return id;
  }

  noteOff(id: number, release = 0.4) {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + release);
    for (const osc of v.partials) osc.stop(t + release + 0.05);
    this.voices.delete(id);
  }

  /** Pluck a degree that releases itself — used by touch taps and auto-demo. */
  pluck(freq: number, velocity = 0.8, dur = 0.6): number {
    const id = this.noteOn(freq, velocity);
    const v = this.voices.get(id);
    if (v) {
      const t = this.ctx.currentTime;
      v.gain.gain.setTargetAtTime(0.0001, t + dur * 0.4, dur * 0.35);
      for (const osc of v.partials) osc.stop(t + dur + 0.2);
      this.voices.delete(id);
    }
    return id;
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        for (const osc of v.partials) osc.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    void this.ctx.close();
  }
}
