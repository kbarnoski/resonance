// Formant source-filter "ahh" choir synthesis for 941-kids-choir-bloom.
//
// Approach (Cantor Digitalis / Chorus Digitalis, IRCAM/LIMSI):
// each voice = glottal SOURCE (band-limited sawtooth + slow vibrato + slight
// detune shimmer) -> parallel bank of bandpass BiquadFilters tuned to vowel
// FORMANT frequencies -> per-voice gain. This is classic DSP, NOT samples,
// NOT granular, NOT a neural net.
//
// Kids-safe master chain: sum -> masterGain (~0.26) -> lowpass (~6.5kHz)
// -> DynamicsCompressor (-10, 20:1) -> destination. Loudness is fixed; a
// harder/faster drag only changes pitch, never level or brightness.

import { midiToHz, type VoiceId } from "./voices";

// Formant tables for a warm /a/ ("ahh") vowel, brighter for high voices and
// darker for the bass, per source-filter register colouring.
interface Formant {
  freq: number;
  q: number;
  gain: number; // relative weight of this formant
}

function formantsFor(id: VoiceId): Formant[] {
  // Base /a/ ~ F1 700, F2 1100, F3 2600, F4 3400.
  switch (id) {
    case "bass":
      return [
        { freq: 600, q: 7, gain: 1.0 },
        { freq: 950, q: 9, gain: 0.6 },
        { freq: 2300, q: 11, gain: 0.28 },
      ];
    case "tenor":
      return [
        { freq: 680, q: 7, gain: 1.0 },
        { freq: 1050, q: 9, gain: 0.65 },
        { freq: 2500, q: 11, gain: 0.32 },
      ];
    case "alto":
      return [
        { freq: 740, q: 7, gain: 1.0 },
        { freq: 1150, q: 9, gain: 0.7 },
        { freq: 2700, q: 11, gain: 0.4 },
        { freq: 3300, q: 12, gain: 0.18 },
      ];
    case "soprano":
      return [
        { freq: 800, q: 7, gain: 1.0 },
        { freq: 1250, q: 9, gain: 0.75 },
        { freq: 2900, q: 11, gain: 0.45 },
        { freq: 3600, q: 12, gain: 0.22 },
      ];
  }
}

interface Voice {
  id: VoiceId;
  // Two slightly detuned saw oscillators for a richer, choir-like source.
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  vibrato: OscillatorNode;
  vibratoGain: GainNode;
  sourceMix: GainNode;
  formants: BiquadFilterNode[];
  voiceGain: GainNode;
}

export class ChoirSynth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private voices: Map<VoiceId, Voice> = new Map();
  private started = false;

  constructor() {
    type ACtor = typeof AudioContext;
    const Ctor: ACtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: ACtor }).webkitAudioContext;
    this.ctx = new Ctor();

    // --- kids-safe master chain ---
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 6500;
    this.lowpass.Q.value = 0.5;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  private makeVoice(id: VoiceId, midi: number): Voice {
    const ctx = this.ctx;
    const hz = midiToHz(midi);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "sawtooth";
    oscA.frequency.value = hz;
    oscB.frequency.value = hz;
    // Slight detune shimmer between the two source oscillators.
    oscA.detune.value = -5;
    oscB.detune.value = +6;

    // Slow ~5.5 Hz vibrato, ~+/-15 cents, modulating both oscillators.
    const vibrato = ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = 5.0 + Math.random() * 1.2;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 14; // cents
    vibrato.connect(vibratoGain);
    vibratoGain.connect(oscA.detune);
    vibratoGain.connect(oscB.detune);

    const sourceMix = ctx.createGain();
    sourceMix.gain.value = 0.5;
    oscA.connect(sourceMix);
    oscB.connect(sourceMix);

    // Parallel bandpass formant bank.
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = id === "soprano" ? 0.95 : id === "bass" ? 0.85 : 0.78;

    const formants: BiquadFilterNode[] = [];
    for (const f of formantsFor(id)) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f.freq;
      bp.Q.value = f.q;
      const fg = ctx.createGain();
      fg.gain.value = f.gain;
      sourceMix.connect(bp);
      bp.connect(fg);
      fg.connect(voiceGain);
      formants.push(bp);
    }

    voiceGain.connect(this.master);

    return { id, oscA, oscB, vibrato, vibratoGain, sourceMix, formants, voiceGain };
  }

  // Must be called inside a user gesture (tap) to satisfy iOS autoplay rules.
  async start(initial: Record<VoiceId, number>): Promise<void> {
    if (this.started) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();

    (Object.keys(initial) as VoiceId[]).forEach((id) => {
      const v = this.makeVoice(id, initial[id]);
      this.voices.set(id, v);
      const t = this.ctx.currentTime;
      v.oscA.start(t);
      v.oscB.start(t);
      v.vibrato.start(t);
    });

    // Gentle fade-in — no loud transient.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.26, now + 1.4);

    this.started = true;
  }

  // Glide one voice to a new MIDI pitch (smooth, never clicky).
  setVoicePitch(id: VoiceId, midi: number, glideMs = 110): void {
    const v = this.voices.get(id);
    if (!v) return;
    const hz = midiToHz(midi);
    const now = this.ctx.currentTime;
    const tau = glideMs / 1000 / 3; // setTargetAtTime time-constant
    v.oscA.frequency.setTargetAtTime(hz, now, tau);
    v.oscB.frequency.setTargetAtTime(hz, now, tau);
  }

  setMasterGain(g: number, ms = 200): void {
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(g, now, ms / 1000 / 3);
  }

  isStarted(): boolean {
    return this.started;
  }

  async dispose(): Promise<void> {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.08);
    } catch {
      // ignore
    }
    this.voices.forEach((v) => {
      try {
        v.oscA.stop();
        v.oscB.stop();
        v.vibrato.stop();
      } catch {
        // already stopped
      }
      [v.oscA, v.oscB, v.vibrato, v.vibratoGain, v.sourceMix, v.voiceGain, ...v.formants].forEach(
        (n) => {
          try {
            n.disconnect();
          } catch {
            // ignore
          }
        },
      );
    });
    this.voices.clear();
    try {
      this.master.disconnect();
      this.lowpass.disconnect();
      this.comp.disconnect();
    } catch {
      // ignore
    }
    try {
      await this.ctx.close();
    } catch {
      // ignore
    }
  }
}
