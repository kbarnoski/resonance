/**
 * Web Audio engine for the chromatic organ.
 *
 * One note event drives a 2-operator FM voice: a carrier OscillatorNode is
 * frequency-modulated by a modulator OscillatorNode (via a modulation-index
 * GainNode). Each voice has its own ADSR amplitude envelope. Voices sum into a
 * master GainNode → a DynamicsCompressor (acting as a soft limiter) →
 * destination, so a fistful of keys never clips or ice-picks the ear.
 *
 * Polyphony is capped at MAX_VOICES with oldest-voice stealing.
 */

const MAX_VOICES = 8;

interface Voice {
  id: number;
  midi: number;
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modIndex: GainNode;
  amp: GainNode;
  startedAt: number;
  releasing: boolean;
}

export class OrganAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private nextId = 1;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  /** Start a voice for a MIDI note; returns a voice id used to release it. */
  noteOn(midi: number, freq: number, velocity: number): number {
    if (this.voices.length >= MAX_VOICES) {
      // Steal the oldest voice.
      const oldest = this.voices.reduce((a, b) =>
        a.startedAt <= b.startedAt ? a : b,
      );
      this.hardStop(oldest);
    }

    const t = this.ctx.currentTime;
    const ctx = this.ctx;

    // Warm 2-op FM: modulator a touch below the carrier's octave for a bell /
    // Rhodes character; modulation index scales gently with velocity.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    // Modulator ratio 2:1 gives a bright but musical partial series.
    modulator.frequency.value = freq * 2;

    const modIndex = ctx.createGain();
    const idxPeak = freq * (0.8 + velocity * 2.2);
    modIndex.gain.setValueAtTime(idxPeak, t);
    // Modulation index decays so the attack is bright and the sustain mellow.
    modIndex.gain.exponentialRampToValueAtTime(
      Math.max(freq * 0.25, 1),
      t + 0.6,
    );

    modulator.connect(modIndex);
    modIndex.connect(carrier.frequency);

    const amp = ctx.createGain();
    const peak = 0.09 + velocity * 0.22;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.012); // attack
    amp.gain.exponentialRampToValueAtTime(peak * 0.55, t + 0.35); // decay→sustain

    carrier.connect(amp);
    amp.connect(this.master);

    carrier.start(t);
    modulator.start(t);

    const voice: Voice = {
      id: this.nextId++,
      midi,
      carrier,
      modulator,
      modIndex,
      amp,
      startedAt: t,
      releasing: false,
    };
    this.voices.push(voice);
    return voice.id;
  }

  noteOff(id: number): void {
    const v = this.voices.find((x) => x.id === id);
    if (!v || v.releasing) return;
    v.releasing = true;
    const t = this.ctx.currentTime;
    const g = v.amp.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.exponentialRampToValueAtTime(0.0001, t + 0.45); // release
    const stopAt = t + 0.5;
    v.carrier.stop(stopAt);
    v.modulator.stop(stopAt);
    const vid = v.id;
    window.setTimeout(() => this.dropVoice(vid), 560);
  }

  private hardStop(v: Voice): void {
    const t = this.ctx.currentTime;
    try {
      v.amp.gain.cancelScheduledValues(t);
      v.amp.gain.setValueAtTime(Math.max(v.amp.gain.value, 0.0001), t);
      v.amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      v.carrier.stop(t + 0.06);
      v.modulator.stop(t + 0.06);
    } catch {
      /* already stopped */
    }
    this.dropVoice(v.id);
  }

  private dropVoice(id: number): void {
    const i = this.voices.findIndex((x) => x.id === id);
    if (i === -1) return;
    const v = this.voices[i];
    try {
      v.carrier.disconnect();
      v.modulator.disconnect();
      v.modIndex.disconnect();
      v.amp.disconnect();
    } catch {
      /* noop */
    }
    this.voices.splice(i, 1);
  }

  dispose(): void {
    for (const v of [...this.voices]) this.hardStop(v);
    this.voices = [];
    try {
      this.master.disconnect();
      this.limiter.disconnect();
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
