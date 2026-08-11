// ─────────────────────────────────────────────────────────────────────────────
// 9768-mpelace — synth.ts
//
// The internal Web Audio voice: a simple 2-operator FM tone (sine carrier,
// sine modulator at a fixed ratio) so the instrument ALWAYS sounds at the
// exact microtonal Hz, whether or not a MIDI device is attached. This is
// what makes the piece "always works unplugged" — the MPE-out path and the
// internal synth are driven from the SAME exact frequency, never a rounded
// one.
// ─────────────────────────────────────────────────────────────────────────────

const MOD_RATIO = 2.0; // carrier:modulator ratio — a clean, bell-ish 2-op tone
const ATTACK = 0.012;
const RELEASE = 0.28;

export interface Voice {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode;
  ampGain: GainNode;
  freqHz: number;
}

export class InternalSynth {
  private ctx: AudioContext;
  private dest: AudioNode;
  private voices = new Map<string, Voice>();

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  noteOn(id: string, freqHz: number, velocity: number): void {
    this.noteOff(id, true);
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freqHz;

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = freqHz * MOD_RATIO;

    const modGain = ctx.createGain();
    // modulation index scales gently with velocity: louder taps get a touch
    // more brightness, never harsh (safeMaster's shelf/cap catch the rest).
    modGain.gain.value = freqHz * (0.6 + 0.8 * velocity);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const ampGain = ctx.createGain();
    ampGain.gain.setValueAtTime(0, now);
    ampGain.gain.linearRampToValueAtTime(0.22 * Math.min(1, 0.35 + velocity), now + ATTACK);

    carrier.connect(ampGain);
    ampGain.connect(this.dest);

    carrier.start(now);
    modulator.start(now);

    this.voices.set(id, { carrier, modulator, modGain, ampGain, freqHz });
  }

  /** Update the sounding pitch of a held voice without retriggering it (used
   *  when the auto-arpeggiator or a live retune changes a note in place). */
  retune(id: string, freqHz: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    const now = this.ctx.currentTime;
    v.carrier.frequency.setTargetAtTime(freqHz, now, 0.02);
    v.modulator.frequency.setTargetAtTime(freqHz * MOD_RATIO, now, 0.02);
  }

  noteOff(id: string, immediate = false): void {
    const v = this.voices.get(id);
    if (!v) return;
    const now = this.ctx.currentTime;
    const release = immediate ? 0.02 : RELEASE;
    v.ampGain.gain.cancelScheduledValues(now);
    v.ampGain.gain.setTargetAtTime(0, now, release / 3);
    const stopAt = now + release + 0.05;
    try {
      v.carrier.stop(stopAt);
      v.modulator.stop(stopAt);
    } catch {
      /* already stopped */
    }
    v.carrier.addEventListener("ended", () => {
      try {
        v.carrier.disconnect();
        v.modulator.disconnect();
        v.modGain.disconnect();
        v.ampGain.disconnect();
      } catch {
        /* already torn down */
      }
    });
    this.voices.delete(id);
  }

  isHeld(id: string): boolean {
    return this.voices.has(id);
  }

  disposeAll(): void {
    for (const id of Array.from(this.voices.keys())) this.noteOff(id, true);
  }
}
