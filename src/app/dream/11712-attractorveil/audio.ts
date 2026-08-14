// ─────────────────────────────────────────────────────────────────────────────
// 11712-attractorveil · audio.ts — the sounding nebula: a self-driving ambient
// drone that evolves with the SAME 1/f process as the visuals.
//
//   This is a self-driving piece, not a file/mic player. On the visitor's gesture
//   we build a small bank of continuous, always-sounding oscillator voices — a
//   slow, boundless, meditative pad. Their frequencies GLIDE (never re-trigger)
//   toward the current drone chord as the Evolution's harmony wanders over
//   minutes, so the sound never loops and is clearly different at minute 5 than at
//   minute 1. A gentle pink-driven swell breathes the whole pad.
//
//   ROUTING (non-negotiable): AudioContext created on the gesture; EVERY source
//   into createSafeMaster().input — never ctx.destination — via a createVoidReverb
//   tail for cosmic depth. The visuals read master.analyser for amplitude +
//   spectral brightness, which feed back into the particles' glow + flow speed.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import { mtof, clamp } from "./prng";
import type { EvoState, Features } from "./evolution";

type AudioCtor = typeof AudioContext;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  interval: number; // its slot in the chord array
}

export class VeilAudio {
  readonly ctx: AudioContext;
  private readonly master: SafeMaster;
  private readonly reverb: VoidReverb;
  private readonly padGain: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly voices: Voice[] = [];
  private readonly timeData: Uint8Array<ArrayBuffer>;
  private readonly freqData: Uint8Array<ArrayBuffer>;

  private started = false;
  private disposed = false;

  // smoothed features so the visuals breathe rather than twitch
  private sAmp = 0.3;
  private sCentroid = 0.4;

  constructor() {
    const Ctor: AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = createSafeMaster(this.ctx, { gain: 0.8 });
    this.reverb = createVoidReverb(this.ctx, { seconds: 6, decay: 2.6, wet: 0.5 });
    this.reverb.output.connect(this.master.input);

    // pad bus: voices → padGain (the breathing) → warm lowpass → reverb + dry
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 1300;
    this.tone.Q.value = 0.4;

    this.padGain.connect(this.tone);
    this.tone.connect(this.reverb.input);
    this.tone.connect(this.master.input); // a little dry body under the wet tail

    const bins = this.master.analyser.frequencyBinCount;
    this.timeData = new Uint8Array(new ArrayBuffer(this.master.analyser.fftSize));
    this.freqData = new Uint8Array(new ArrayBuffer(bins));
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* some browsers resolve resume() lazily */
      }
    }
  }

  /** Build the continuous voice bank and bloom the pad in. Idempotent. */
  start(initial: EvoState): void {
    if (this.disposed || this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    const chord = initial.chord;
    for (let i = 0; i < chord.length; i++) {
      const osc = this.ctx.createOscillator();
      // alternate sine / triangle for a soft, warm pad body
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = mtof(initial.rootMidi + chord[i]);

      const gain = this.ctx.createGain();
      // higher voices sit quieter so the low drone anchors the pad
      const lvl = 0.16 * Math.pow(0.82, i);
      gain.gain.value = lvl;

      osc.connect(gain);
      gain.connect(this.padGain);
      osc.start(now);

      this.voices.push({ osc, gain, interval: chord[i] });
    }

    // slow bloom in (boundless, no attack transient)
    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.exponentialRampToValueAtTime(0.6, now + 4.0);
  }

  /** Called once per frame: glide the voices toward the evolving harmony and
   *  breathe the pad with the pink swell. */
  update(evo: EvoState): void {
    if (this.disposed || !this.started) return;
    const now = this.ctx.currentTime;
    const chord = evo.chord;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const interval = chord[i % chord.length];
      const target = mtof(evo.rootMidi + interval);
      // long glide so harmony changes are a slow morph, never a jump
      v.osc.frequency.setTargetAtTime(target, now, 0.8);
    }
    // breathe the whole pad with the 1/f swell
    const target = 0.35 + 0.45 * evo.swell;
    this.padGain.gain.setTargetAtTime(target, now, 0.5);
    // drift the warmth a touch with the swell so it opens as it breathes
    this.tone.frequency.setTargetAtTime(1100 + 700 * evo.swell, now, 0.6);
  }

  /** Read the live analyser into a smoothed amplitude + brightness. */
  readFeatures(): Features {
    const a = this.master.analyser;
    a.getByteTimeDomainData(this.timeData);
    a.getByteFrequencyData(this.freqData);

    // RMS amplitude from the time domain
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const s = (this.timeData[i] - 128) / 128;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.timeData.length);

    // spectral centroid (brightness)
    const f = this.freqData;
    const n = f.length;
    let wsum = 0;
    let msum = 0;
    for (let i = 1; i < n; i++) {
      wsum += f[i] * i;
      msum += f[i];
    }
    const centroid = msum > 1 ? clamp((wsum / (msum * n)) * 2.6, 0, 1) : this.sCentroid;

    this.sAmp += (clamp(rms * 3.2, 0, 1) - this.sAmp) * 0.1;
    this.sCentroid += (centroid - this.sCentroid) * 0.06;

    return { amp: clamp(this.sAmp, 0, 1), centroid: clamp(this.sCentroid, 0, 1) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const v of this.voices) {
      try {
        v.osc.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.osc.disconnect();
        v.gain.disconnect();
      } catch {
        /* graph gone */
      }
    }
    this.voices.length = 0;
    try {
      this.padGain.disconnect();
      this.tone.disconnect();
      this.reverb.output.disconnect();
    } catch {
      /* graph gone */
    }
    this.master.disconnect();
    try {
      void this.ctx.close();
    } catch {
      /* already closing */
    }
  }
}
