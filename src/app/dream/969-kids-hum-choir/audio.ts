// audio.ts — warm Web Audio choir of friendly creatures.
//
// Each creature is one voice: a small source-filter "ahh/ooh" tone. We use a
// couple of detuned oscillators per voice through bandpass "formant" filters
// to suggest a sung vowel, with slow attack, shared gentle vibrato, and
// portamento when the harmony re-voices so the choir GLIDES between chords.
//
// Master chain: per-voice gain -> master gain (<=0.26) -> lowpass ~7kHz ->
// DynamicsCompressor -> destination, with a light synthesized reverb. Loudness
// is normalized ~1/sqrt(voices). No harsh transients/highs (kid-safe). The
// child's microphone is NEVER routed to output — only the synth choir sounds.

import { midiToHz } from "./harmony";

interface Voice {
  // Two slightly detuned saw-ish oscillators for body.
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  // Two formant bandpass filters in parallel give a vowel-ish color.
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  formantSum: GainNode;
  gain: GainNode; // amplitude envelope for this voice
  currentMidi: number;
}

const NUM_VOICES = 4; // 1 lead-ish doubling + 3 companions worth of body
const PORTAMENTO = 0.18; // seconds — the glide between chords
const ATTACK = 0.5;
const MASTER_GAIN = 0.24;

export class ChoirSynth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private reverb: ConvolverNode;
  private reverbGain: GainNode;
  private vibrato: OscillatorNode;
  private vibratoGain: GainNode;
  private voices: Voice[] = [];
  private started = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // --- master chain ---
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.25;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7000; // tame any highs — kid-safe
    this.lowpass.Q.value = 0.4;

    this.master = ctx.createGain();
    this.master.gain.value = MASTER_GAIN / Math.sqrt(NUM_VOICES);

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(ctx.destination);

    // --- light reverb (synthesized impulse) ---
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 1.8, 2.4);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.master.connect(this.reverbGain);
    this.reverbGain.connect(this.reverb);
    this.reverb.connect(this.comp);

    // --- shared gentle vibrato (LFO into each oscillator detune) ---
    this.vibrato = ctx.createOscillator();
    this.vibrato.frequency.value = 5.2;
    this.vibratoGain = ctx.createGain();
    this.vibratoGain.gain.value = 5; // cents of warble
    this.vibrato.connect(this.vibratoGain);
    this.vibrato.start();

    // --- build voices ---
    const startMidi = [48, 55, 60, 64];
    for (let i = 0; i < NUM_VOICES; i++) {
      this.voices.push(this.buildVoice(startMidi[i]));
    }
  }

  private buildVoice(midi: number): Voice {
    const ctx = this.ctx;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscB.type = "sawtooth";
    const hz = midiToHz(midi);
    oscA.frequency.value = hz;
    oscB.frequency.value = hz;
    oscB.detune.value = 8; // chorusy beat between the pair
    this.vibratoGain.connect(oscA.detune);
    this.vibratoGain.connect(oscB.detune);

    // Two formant bandpasses (roughly an "ah"-ish vowel) for warmth.
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 700;
    f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1100;
    f2.Q.value = 8;

    const formantSum = ctx.createGain();
    formantSum.gain.value = 1;

    oscA.connect(f1);
    oscB.connect(f1);
    oscA.connect(f2);
    oscB.connect(f2);
    f1.connect(formantSum);
    f2.connect(formantSum);

    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // start silent; fade in on start
    formantSum.connect(gain);
    gain.connect(this.master);

    oscA.start();
    oscB.start();

    return { oscA, oscB, f1, f2, formantSum, gain, currentMidi: midi };
  }

  /** Begin sounding (idle held tonic). Call once, inside the Start gesture. */
  start() {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(0.0001, t);
      v.gain.gain.exponentialRampToValueAtTime(0.22, t + ATTACK);
    }
  }

  /**
   * Re-voice the choir to a new chord. `lead` is the child's note; `voices`
   * are the three companions. We map the 4 synth voices to [lead, v0, v1, v2]
   * and portamento each to its new pitch so the choir glides.
   * `loudness` (0..1) opens the overall level; `tension` brightens slightly.
   */
  setChord(
    lead: number,
    companions: [number, number, number],
    loudness: number,
    tension: number,
  ) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const targets = [lead, companions[0], companions[1], companions[2]];

    // Tension brightens the upper formant + nudges level; resolution mellows.
    const formantHi = 1050 + tension * 500;
    const level = 0.14 + Math.min(1, loudness) * 0.16;

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const midi = targets[i];
      if (midi == null) continue;
      const hz = midiToHz(midi);
      // portamento glide
      v.oscA.frequency.cancelScheduledValues(t);
      v.oscB.frequency.cancelScheduledValues(t);
      v.oscA.frequency.setTargetAtTime(hz, t, PORTAMENTO);
      v.oscB.frequency.setTargetAtTime(hz, t, PORTAMENTO);
      v.f2.frequency.setTargetAtTime(formantHi, t, 0.2);
      // The lead voice (i===0) sits a touch louder so the melody reads.
      const vg = (i === 0 ? level * 1.15 : level * 0.78);
      v.gain.gain.setTargetAtTime(Math.max(0.02, vg), t, 0.12);
      v.currentMidi = midi;
    }
  }

  /** A soft held tonic when the child is quiet, so the choir breathes. */
  idle(loudness = 0.0) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const level = 0.08 + loudness * 0.04;
    for (const v of this.voices) {
      v.gain.gain.setTargetAtTime(level, t, 0.4);
    }
  }

  /** Current MIDI of each synth voice (for the visualizer). */
  get voiceMidis(): number[] {
    return this.voices.map((v) => v.currentMidi);
  }

  async dispose() {
    try {
      const t = this.ctx.currentTime;
      for (const v of this.voices) {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0.0001, t, 0.1);
      }
      // Let the fade happen, then tear down.
      await new Promise((r) => setTimeout(r, 160));
      for (const v of this.voices) {
        try {
          v.oscA.stop();
          v.oscB.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        this.vibrato.stop();
      } catch {
        /* ignore */
      }
      if (this.ctx.state !== "closed") await this.ctx.close();
    } catch {
      /* ignore teardown errors */
    }
  }
}

/** Synthesized exponential-decay noise impulse for a soft hall reverb. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}
