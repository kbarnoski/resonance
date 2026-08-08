// 8488-secondear — a clean 12-TET 2-op FM/mallet voice + phrase scheduler.
// Web Audio API only. NO drone bed: every note is a discrete plucked mallet
// that rings and decays. Silent until the player enables sound (a real
// gesture), so the self-demo needs no audio permission.

import type { Phrase } from "./compose";

/** Equal-tempered (12-TET) MIDI → frequency. A4 = 440 Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class SecondEarAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  ok = false;

  /** Create/resume the context. Must be called from a user gesture. */
  async ensure(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.ok = this.ctx.state === "running";
      return this.ok;
    } catch {
      this.ok = false;
      return false;
    }
  }

  /** AudioContext clock, or 0 before init. */
  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
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

    const peak = 0.16 + 0.14 * vel;
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
      const ring = phrase.bold ? stepDur * 3.4 : stepDur * 2.6;
      this.strike(midiToFreq(n.midi), at, ring, 0.6);
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
    this.ok = false;
  }
}
