// ─────────────────────────────────────────────────────────────────────────
// Kids-safe Web Audio pad with click-free continuous chord-quality morph.
// Chain: master gain ≈0.28 → lowpass ≈7000 → DynamicsCompressor → destination
// ─────────────────────────────────────────────────────────────────────────
import { ROOT_MIDI, midiToHz, type Feeling } from "./harmony";

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
};

export class FeelingsAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;

  private root!: Voice; // always-on drone
  private fifth!: Voice; // always-on perfect fifth
  private third!: Voice; // morphing color voice
  private added!: Voice; // high added-tone color voice (fades in)

  private ready = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // ramp up after start (soft attack)

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 7000;
    this.lp.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    this.master.connect(this.lp);
    this.lp.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture (iOS unlock). */
  async start(): Promise<void> {
    if (this.ready) return;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const t = this.ctx.currentTime;

    this.root = this.makeVoice("sine", midiToHz(ROOT_MIDI), 0.55);
    this.fifth = this.makeVoice("sine", midiToHz(ROOT_MIDI + 7), 0.32);
    this.third = this.makeVoice("triangle", midiToHz(ROOT_MIDI + 4), 0.26);
    this.added = this.makeVoice("sine", midiToHz(ROOT_MIDI + 12), 0.0);

    // Soft master attack ~ 0.6s so load is never a transient.
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0, t);
    this.master.gain.linearRampToValueAtTime(0.28, t + 0.6);

    this.ready = true;
  }

  private makeVoice(
    type: OscillatorType,
    hz: number,
    gain: number,
  ): Voice {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    return { osc, gain: g };
  }

  /** Continuously morph the color voices toward the current feeling. */
  morph(f: Feeling): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const TC = 0.08; // setTargetAtTime time-constant → smooth glide

    const thirdHz = midiToHz(ROOT_MIDI + f.thirdSemi);
    const addHz = midiToHz(ROOT_MIDI + f.addSemi);

    this.third.osc.frequency.setTargetAtTime(thirdHz, t, TC);
    this.added.osc.frequency.setTargetAtTime(addHz, t, TC);
    // Added voice fades in toward dreamy/floaty corners (scaled gentle).
    this.added.gain.gain.setTargetAtTime(0.22 * f.addLevel, t, TC);
  }

  /** Soft bell sparkle that trails the sun (one per call, decays out). */
  sparkle(semitoneAbove: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(ROOT_MIDI + 24 + semitoneAbove);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02); // soft, never piercing
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  dispose(): void {
    try {
      void this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
