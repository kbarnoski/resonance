// 8520 · Air Conductor — Web Audio ensemble.
//
// A small consonant choir of 7 struck/bowed voices, tuned to a two-octave
// major triad (a subset of the overtone series: harmonics 4·5·6 across octaves,
// very consonant). NO sustained drone bed — voices only sound when the
// conductor CUES a section. Each note is a 2-op FM tone with a percussive/bowed
// envelope, a per-voice lowpass (brightness), stereo pan across the fan, and a
// shared plate-ish reverb + delay for air.

import { VOICE_COUNT } from "./conductor";

// Two-octave major triad on C. Consonant "small choir" — 7 voices.
// (C3 E3 G3 C4 E4 G4 C5) ≈ harmonics 4,5,6,8,10,12,16 of a 65.4 Hz fundamental.
const VOICE_FREQS = [130.81, 164.81, 196.0, 261.63, 329.63, 392.0, 523.25];

export class ConductorAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private reverbWet: GainNode;
  private delay: DelayNode;
  private delayFb: GainNode;

  private dynamics = 0.5;
  private brightness = 0.5;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;

    // Shared reverb (generated impulse) for space.
    const conv = this.ctx.createConvolver();
    conv.buffer = this.makeImpulse(1.9, 2.4);
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0.34;
    conv.connect(this.reverbWet);
    this.reverbWet.connect(this.master);

    // Gentle feedback delay for rhythmic bloom.
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.33;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.28;
    const delayWet = this.ctx.createGain();
    delayWet.gain.value = 0.2;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(delayWet);
    delayWet.connect(this.master);

    // Expose the FX sends for notes to tap.
    this.reverbSend = conv;
    this.delaySend = this.delay;

    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  private reverbSend: ConvolverNode;
  private delaySend: DelayNode;

  get contextState(): AudioContextState {
    return this.ctx.state;
  }

  async resume() {
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  setDynamics(v: number) {
    this.dynamics = clamp01(v);
  }
  setBrightness(v: number) {
    this.brightness = clamp01(v);
  }

  /** Strike one voice. velocity 0..1, brightness 0..1 (→ cutoff + FM depth),
   *  articulation 0..1 (0 legato/long, 1 staccato/short). `at` = ctx time. */
  strike(voice: number, velocity: number, at: number) {
    const idx = Math.max(0, Math.min(VOICE_COUNT - 1, voice));
    const f = VOICE_FREQS[idx];
    const t0 = at;
    const vel = clamp01(velocity);
    const bright = this.brightness;
    const artic = bright; // tight pinch → bright AND staccato

    // Envelope timing.
    const attack = 0.006 + (1 - artic) * 0.05; // bowed = slower onset
    const decay = lerp(1.9, 0.3, artic); // staccato = short
    const peak = 0.06 + vel * 0.16;

    // 2-op FM: modulator at a small integer-ish ratio, depth from brightness.
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = f;

    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 2.0; // octave modulator → clarinet/bell colour
    const modGain = this.ctx.createGain();
    const modDepth = f * lerp(0.6, 3.2, bright) * (0.5 + vel * 0.5);
    modGain.gain.setValueAtTime(modDepth, t0);
    modGain.gain.exponentialRampToValueAtTime(
      Math.max(1, modDepth * 0.08),
      t0 + decay * 0.8,
    );
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Per-voice tone filter.
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lerp(1100, 6800, bright);
    filt.Q.value = 0.7;

    // Amp envelope.
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    amp.gain.exponentialRampToValueAtTime(0.0006, t0 + attack + decay);

    // Pan across the fan.
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (idx / (VOICE_COUNT - 1)) * 1.4 - 0.7;

    carrier.connect(filt);
    filt.connect(amp);
    amp.connect(pan);
    pan.connect(this.master);
    // FX sends, scaled by voice loudness.
    const send = this.ctx.createGain();
    send.gain.value = 0.5;
    amp.connect(send);
    send.connect(this.reverbSend);
    send.connect(this.delaySend);

    carrier.start(t0);
    mod.start(t0);
    const stop = t0 + attack + decay + 0.1;
    carrier.stop(stop);
    mod.stop(stop);
    carrier.onended = () => {
      carrier.disconnect();
      mod.disconnect();
      modGain.disconnect();
      filt.disconnect();
      amp.disconnect();
      pan.disconnect();
      send.disconnect();
    };
  }

  /** CUE the foregrounded section: strike its voice strongly, then feather in
   *  its two neighbours softly and slightly late — a small phrase, not a drone.
   *  Loudness scales with the current dynamics field. */
  cue(section: number, strength: number) {
    const now = this.ctx.currentTime + 0.01;
    const dyn = this.dynamics;
    const lead = clamp01(0.45 + dyn * 0.55) * clamp01(0.5 + strength * 0.5);
    this.strike(section, lead, now);

    // Neighbours arpeggiate in, quieter — richer when dynamics is high.
    const spread = lerp(0.02, 0.11, 1 - this.brightness); // legato = wider roll
    const nb = 0.28 + dyn * 0.5;
    if (section - 1 >= 0) this.strike(section - 1, nb * lead, now + spread);
    if (section + 1 < VOICE_COUNT)
      this.strike(section + 1, nb * lead, now + spread * 1.8);
    // A high shimmer voice on strong, bright cues.
    if (dyn > 0.6 && this.brightness > 0.5) {
      this.strike(VOICE_COUNT - 1, 0.3 * lead, now + spread * 2.6);
    }
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  close() {
    try {
      this.master.disconnect();
      this.comp.disconnect();
      this.reverbWet.disconnect();
      this.delay.disconnect();
      this.delayFb.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
