// 9160-tasteprint — a clean 12-TET 2-op FM / mallet voice + phrase scheduler.
// Web Audio API only. NO drone bed: every note is a discrete plucked mallet that
// rings and decays. Silent until the listener enables sound (a real gesture), so
// the seeded self-demo needs no audio permission. Signal chain:
//   per-note FM voice → master gain (~0.18) → DynamicsCompressor → destination.

import type { Phrase } from "./compose";

/** Equal-tempered (12-TET) MIDI → frequency. A4 = 440 Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class TasteprintAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  ok = false;

  /** Create/resume the context. Must be called from a user gesture. */
  async ensure(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return false;
        this.ctx = new Ctor();
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.ratio.value = 3;
        this.comp.attack.value = 0.004;
        this.comp.release.value = 0.18;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.ok = this.ctx.state === "running";
      return this.ok;
    } catch {
      this.ok = false;
      return false;
    }
  }

  private strike(freq: number, at: number, dur: number, vel: number): void {
    if (!this.ctx || !this.master) return;
    const t = Math.max(at, this.ctx.currentTime + 0.001);
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const amp = this.ctx.createGain();

    carrier.type = "triangle";
    mod.type = "sine";
    mod.frequency.value = freq * 2.01; // inharmonic-ish mallet ratio
    modGain.gain.setValueAtTime(freq * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.6);
    carrier.frequency.value = freq;
    mod.connect(modGain).connect(carrier.frequency);

    const peak = 0.5 + 0.4 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    carrier.connect(amp).connect(this.master);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  /** Schedule a whole phrase starting ~now. Returns its duration in seconds. */
  playPhrase(phrase: Phrase, bpm: number): number {
    if (!this.ctx || !this.ok) return 0;
    const stepDur = 60 / bpm / 2; // eighth-note grid
    const start = this.ctx.currentTime + 0.06;
    for (const n of phrase.notes) {
      const at = start + n.step * stepDur;
      this.strike(midiToFreq(n.midi), at, stepDur * 2.6, 0.6);
    }
    return phrase.steps * stepDur;
  }

  close(): void {
    try {
      this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.ok = false;
  }
}
