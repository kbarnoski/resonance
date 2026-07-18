// Web Audio SATB voice engine. Three (or four, in mic-less fallback) additive
// "choir" voices: two slightly-detuned oscillators per voice through a lowpass,
// gliding between notes with soft attack/release envelopes, summed into a gentle
// generated-impulse reverb. Built lazily on the first user gesture.

import { midiToFreq } from "./pitch";
import type { Voicing } from "./harmony";

type VoiceKey = "s" | "a" | "t" | "b";

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  /** ms timestamp of the last note strike (for the visual envelope). */
  lastStrike: number;
  active: boolean;
}

export type Articulation = "legato" | "detached";

export class ChoirEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private voices: Record<VoiceKey, Voice>;
  private includeSoprano: boolean;
  articulation: Articulation = "legato";

  constructor(includeSoprano: boolean) {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.includeSoprano = includeSoprano;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;

    const reverb = this.ctx.createConvolver();
    reverb.buffer = this.buildImpulse(1.9, 2.4);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.32;
    const dry = this.ctx.createGain();
    dry.gain.value = 0.85;

    this.master.connect(dry).connect(this.ctx.destination);
    this.master.connect(reverb).connect(wet).connect(this.ctx.destination);

    const pans: Record<VoiceKey, number> = { s: 0.1, a: 0.45, t: -0.45, b: -0.1 };
    const timbre: Record<VoiceKey, OscillatorType> = {
      s: "sine",
      a: "triangle",
      t: "triangle",
      b: "sawtooth",
    };
    const cutoff: Record<VoiceKey, number> = { s: 2600, a: 2000, t: 1500, b: 900 };

    const make = (key: VoiceKey): Voice => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = timbre[key];
      osc2.type = "sine";
      osc2.detune.value = 6;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff[key];
      filter.Q.value = 0.7;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = pans[key];
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(pan).connect(this.master);
      osc1.start();
      osc2.start();
      return { osc1, osc2, filter, gain, pan, lastStrike: 0, active: false };
    };

    this.voices = { s: make("s"), a: make("a"), t: make("t"), b: make("b") };
  }

  private buildImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.5, now, 0.4);
  }

  /** Level per voice: bass/tenor a touch louder for a warm foundation. */
  private voiceLevel(key: VoiceKey): number {
    return { s: 0.16, a: 0.18, t: 0.2, b: 0.24 }[key];
  }

  /**
   * Move the machine voices to a new chord. When live, the soprano is the human
   * singer and is left silent; in fallback mode it is voiced too.
   */
  setChord(voicing: Voicing, playedVoices: VoiceKey[]) {
    const now = this.ctx.currentTime;
    const glide = this.articulation === "legato" ? 0.09 : 0.02;
    const attack = this.articulation === "legato" ? 0.08 : 0.012;
    const strikeMs = performance.now();

    (Object.keys(this.voices) as VoiceKey[]).forEach((key) => {
      const voice = this.voices[key];
      const shouldPlay =
        playedVoices.includes(key) && (this.includeSoprano || key !== "s");
      if (!shouldPlay) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.12);
        voice.active = false;
        return;
      }
      const freq = midiToFreq(voicing[key]);
      voice.osc1.frequency.setTargetAtTime(freq, now, glide);
      voice.osc2.frequency.setTargetAtTime(freq, now, glide);
      const level = this.voiceLevel(key);
      voice.gain.gain.cancelScheduledValues(now);
      if (this.articulation === "detached") {
        // Re-attack with a short decay for a marked, non-washy sound.
        voice.gain.gain.setValueAtTime(0.0001, now);
        voice.gain.gain.linearRampToValueAtTime(level, now + attack);
        voice.gain.gain.setTargetAtTime(level * 0.55, now + attack, 0.35);
      } else {
        voice.gain.gain.setTargetAtTime(level, now, attack);
      }
      voice.lastStrike = strikeMs;
      voice.active = true;
    });
  }

  /** Fade everything out and hold (used on stop / silence). */
  hush() {
    const now = this.ctx.currentTime;
    (Object.keys(this.voices) as VoiceKey[]).forEach((key) => {
      this.voices[key].gain.gain.setTargetAtTime(0, now, 0.18);
      this.voices[key].active = false;
    });
  }

  /** Visual envelope 0..1 for a voice, decaying from its last strike. */
  envelope(key: VoiceKey): number {
    const v = this.voices[key];
    if (!v.active) return 0;
    const dt = (performance.now() - v.lastStrike) / 1000;
    return Math.max(0.25, Math.exp(-dt * 0.9));
  }

  get audioContext() {
    return this.ctx;
  }

  dispose() {
    (Object.keys(this.voices) as VoiceKey[]).forEach((key) => {
      const v = this.voices[key];
      try {
        v.osc1.stop();
        v.osc2.stop();
      } catch {
        // already stopped
      }
    });
    void this.ctx.close();
  }
}
