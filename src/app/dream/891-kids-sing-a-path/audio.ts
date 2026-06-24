"use client";

/**
 * Web Audio harmony voice for "sing a path".
 *
 * GUARANTEE: it always sounds beautiful. The child's raw voice drives the
 * VISUAL contour (PESTO: track shape, not correctness), but the companion tone
 * we sing back is QUANTIZED to C-major pentatonic, so the audio is always
 * consonant no matter how out of tune the child is. A soft pad drone sits
 * underneath. A master compressor/limiter guarantees nothing is ever harsh or
 * sudden — important for a 4-year-old's ears.
 */

// C-major pentatonic across a child-friendly range (C3 → C6). No "wrong" note
// exists in this set, so contour direction always maps to a pretty pitch.
const PENTATONIC_HZ: number[] = [
  130.81, 146.83, 164.81, 196.0, 220.0, // C3 D3 E3 G3 A3
  261.63, 293.66, 329.63, 392.0, 440.0, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.0, // C5 D5 E5 G5 A5
  1046.5, // C6
];

/** Snap a contour height in [-1,1] to a pentatonic degree (index). */
function contourToDegree(height: number): number {
  const t = (height + 1) / 2; // 0..1
  const idx = Math.round(t * (PENTATONIC_HZ.length - 1));
  return Math.max(0, Math.min(PENTATONIC_HZ.length - 1, idx));
}

/** Build a tiny convolution reverb impulse — gentle, short, storybook room. */
function makeReverbImpulse(ctx: AudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

export class HarmonyVoice {
  private ctx: AudioContext;
  private master: DynamicsCompressorNode;
  private voiceGain: GainNode;
  private padGain: GainNode;
  private reverbGain: GainNode;

  private voiceOsc: OscillatorNode;
  private voicePartial: OscillatorNode; // soft triangle an octave up at low gain
  private padOscs: OscillatorNode[] = [];
  // (voicePartial is constructed inline in the constructor below.)

  private currentDegree = -1;
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // --- Master limiter/compressor: never harsh, never sudden. ---
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -18;
    this.master.knee.value = 24;
    this.master.ratio.value = 12;
    this.master.attack.value = 0.012;
    this.master.release.value = 0.28;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    this.master.connect(masterGain);
    masterGain.connect(ctx.destination);

    // --- Reverb send (soft glow on everything). ---
    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbImpulse(ctx);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    // --- Companion voice (sine + soft triangle partial). ---
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0; // silent until the child sings
    this.voiceGain.connect(this.master);
    this.voiceGain.connect(convolver);

    this.voiceOsc = ctx.createOscillator();
    this.voiceOsc.type = "sine";
    this.voiceOsc.frequency.value = PENTATONIC_HZ[5];

    this.voicePartial = ctx.createOscillator();
    this.voicePartial.type = "triangle";
    this.voicePartial.frequency.value = PENTATONIC_HZ[5] * 2;
    this.voicePartial.connect(this.voiceGain);
    this.voiceOsc.connect(this.voiceGain);

    // --- Pad drone: C major triad, very soft, slow movement. ---
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0; // fades in on start
    this.padGain.connect(this.master);
    this.padGain.connect(convolver);
    const padFreqs = [130.81, 164.81, 196.0]; // C3 E3 G3
    for (const f of padFreqs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      // Slight, slow detune wobble for a living, warm pad.
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 1.2;
      lfo.connect(lfoGain);
      lfoGain.connect(o.detune);
      lfo.start();
      o.connect(this.padGain);
      this.padOscs.push(o);
    }
  }

  /** Start oscillators and gently fade the pad in. Call from a user gesture. */
  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.voiceOsc.start();
    this.voicePartial.start();
    for (const o of this.padOscs) o.start();
    // Gentle pad fade-in — no sudden onset.
    this.padGain.gain.setValueAtTime(0, t);
    this.padGain.gain.linearRampToValueAtTime(0.05, t + 2.5);
  }

  /**
   * Update the companion tone from the child's contour height [-1,1] and their
   * loudness (rms 0..1). When silent, the voice fades out gently. Pitch is
   * always snapped to pentatonic so it can never clash.
   */
  update(height: number | null, rms: number) {
    if (!this.started) return;
    const t = this.ctx.currentTime;

    if (height === null || rms < 0.012) {
      // Fade the companion voice down softly — gentle release.
      this.voiceGain.gain.setTargetAtTime(0, t, 0.18);
      return;
    }

    const degree = contourToDegree(height);
    if (degree !== this.currentDegree) {
      this.currentDegree = degree;
      const hz = PENTATONIC_HZ[degree];
      // Glide (portamento) to the new note — never a hard jump.
      this.voiceOsc.frequency.setTargetAtTime(hz, t, 0.06);
      this.voicePartial.frequency.setTargetAtTime(hz * 2, t, 0.06);
    }

    // Loudness shapes the companion volume, softly capped (kids-safe).
    const target = Math.min(0.18, 0.05 + rms * 0.9);
    this.voiceGain.gain.setTargetAtTime(target, t, 0.05);
  }

  /** Play a soft sparkle "twinkle" when the firefly hits a high point. */
  twinkle(height: number) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const degree = Math.min(PENTATONIC_HZ.length - 1, contourToDegree(height) + 2);
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = PENTATONIC_HZ[degree] * 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.reverbGain);
    o.start(t);
    o.stop(t + 0.75);
  }

  /** Tear down all nodes. */
  dispose() {
    try {
      if (this.started) {
        this.voiceOsc.stop();
        this.voicePartial.stop();
        for (const o of this.padOscs) o.stop();
      }
    } catch {
      // already stopped — ignore
    }
  }
}
