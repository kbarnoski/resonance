/**
 * 4616 · Pressing — polyphonic Web Audio voice.
 *
 * One warm voice per note (two detuned saws → lowpass → gain envelope),
 * triggered live as the take is cut AND again on every playback loop of the
 * pressed groove. Velocity opens the filter and sets amplitude, so a hard hit
 * is bright and a restrained one is soft — the same restraint the groove
 * rewards. No libraries, no autoplay before a gesture.
 */
export class PressingAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  /** Must be called from a user gesture. Idempotent. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      const master = this.ctx.createGain();
      master.gain.value = 0.22;
      // Gentle high shelf tamed by a lowpass keeps the whole thing warm.
      const glue = this.ctx.createBiquadFilter();
      glue.type = "lowpass";
      glue.frequency.value = 5200;
      master.connect(glue);
      glue.connect(this.ctx.destination);
      this.master = master;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.unlocked = true;
  }

  get ready(): boolean {
    return this.unlocked && !!this.ctx;
  }

  /** Trigger a single note. `vel` 0..1 sets loudness + brightness. */
  trigger(freq: number, vel: number, pan = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.unlocked) return;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    const cutoff = 500 + vel * vel * 4200;
    filt.frequency.value = cutoff;
    filt.Q.value = 0.8;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "sawtooth";
    oscA.frequency.value = freq;
    oscB.frequency.value = freq;
    oscB.detune.value = 7; // shimmer

    oscA.connect(filt);
    oscB.connect(filt);
    filt.connect(gain);
    gain.connect(panner);
    panner.connect(master);

    const peak = 0.18 + vel * 0.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.12 * peak, now + 0.14);
    const end = now + 1.1;
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(end + 0.05);
    oscB.stop(end + 0.05);
    oscB.onended = () => {
      oscA.disconnect();
      oscB.disconnect();
      filt.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    if (ctx) void ctx.close();
  }
}
