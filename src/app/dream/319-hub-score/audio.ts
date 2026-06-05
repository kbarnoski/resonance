// audio.ts — the continuous JI drone ensemble (Web Audio, no files, no deps).
//
// One Ensemble owns the AudioContext and a shared reverb + limiter. Each player
// (this tab + roster peers + ghosts) is realized as a Voice: a small additive
// stack (fundamental + a few quiet partials) → per-voice lowpass (brightness
// from the field) → breathing-LFO gain (driven by the wall-clock phase) →
// shared convolver → master limiter. Every change glides with setTargetAtTime
// so nothing clicks.

import {
  D_ROOT_HZ,
  JI_RATIOS,
  breathGain,
  type HarmonyField,
  CHORD_PROGRESSION,
} from "./sync";

const GLIDE = 0.35; // setTargetAtTime time-constant for pitch/cutoff glides
const GAIN_GLIDE = 0.08; // faster glide for the breathing amplitude

/** Pitch (Hz) for a JI degree within the current field's octave/chord. */
export function freqFor(degree: number, field: HarmonyField): number {
  const ratio = JI_RATIOS[degree] ?? 1;
  return D_ROOT_HZ * ratio * Math.pow(2, field.octave);
}

/** Snap an arbitrary chosen degree to the nearest active chord-tone of the
 *  current field, so peers always land inside the harmony even while picking. */
export function nearestChordDegree(degree: number, field: HarmonyField): number {
  const chord = CHORD_PROGRESSION[field.chordIndex] ?? [0];
  if (chord.includes(degree)) return degree;
  let best = chord[0];
  let bestD = Infinity;
  for (const c of chord) {
    const d = Math.abs(c - degree);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

interface VoiceNodes {
  partials: OscillatorNode[];
  lpf: BiquadFilterNode;
  breath: GainNode; // amplitude written every frame from the wall clock
  out: GainNode; // membership fade (join/leave)
  offset: number; // per-voice breath phase offset (staggered swell)
  degree: number;
  level: number; // last breathing level, for the visual
}

export class Ensemble {
  readonly ctx: AudioContext;
  private reverb: ConvolverNode;
  private master: GainNode;
  private dry: GainNode;
  private voices = new Map<string, VoiceNodes>();
  private field: HarmonyField;

  constructor(field: HarmonyField) {
    this.field = field;
    this.ctx = new AudioContext();

    // Shared synthesized reverb: a decaying, low-passed noise impulse.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = makeImpulse(this.ctx, 3.6, 2.4);

    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;
    const dry = this.ctx.createGain();
    dry.gain.value = 0.85;

    // Brick-wall-ish limiter so a crowd of voices never clips.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;

    this.reverb.connect(wet);
    wet.connect(limiter);
    dry.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    // Stash the dry bus so voices can tap both paths.
    this.dry = dry;
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setField(field: HarmonyField) {
    this.field = field;
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      const f = freqFor(v.degree, field);
      v.partials.forEach((osc, i) => {
        osc.frequency.setTargetAtTime(f * (i + 1), now, GLIDE);
      });
      // brightness → cutoff (300 Hz .. ~6 kHz, exponential feel)
      const cutoff = 300 * Math.pow(20, field.brightness);
      v.lpf.frequency.setTargetAtTime(cutoff, now, GLIDE);
    }
  }

  /** Add or update a voice. Re-pitches glissando-style if the degree changed. */
  ensureVoice(id: string, degree: number, isSelf: boolean) {
    let v = this.voices.get(id);
    const now = this.ctx.currentTime;
    if (!v) {
      v = this.createVoice(degree);
      this.voices.set(id, v);
      // membership fade-in
      v.out.gain.setValueAtTime(0, now);
      v.out.gain.setTargetAtTime(isSelf ? 1.0 : 0.85, now, 0.8);
    }
    if (v.degree !== degree) {
      v.degree = degree;
      const f = freqFor(degree, this.field);
      v.partials.forEach((osc, i) => osc.frequency.setTargetAtTime(f * (i + 1), now, GLIDE));
    }
  }

  removeVoice(id: string) {
    const v = this.voices.get(id);
    if (!v) return;
    const now = this.ctx.currentTime;
    v.out.gain.setTargetAtTime(0, now, 0.6);
    this.voices.delete(id);
    setTimeout(() => v.partials.forEach((o) => o.stop()), 2000);
  }

  private createVoice(degree: number): VoiceNodes {
    const ctx = this.ctx;
    const f = freqFor(degree, this.field);

    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 300 * Math.pow(20, this.field.brightness);
    lpf.Q.value = 0.5;

    const breath = ctx.createGain();
    breath.gain.value = 0;

    const out = ctx.createGain();
    out.gain.value = 0;

    // Additive stack: fundamental + 3 quiet partials with falloff.
    const partialGains = [0.5, 0.16, 0.09, 0.05];
    const partials: OscillatorNode[] = [];
    for (let i = 0; i < partialGains.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = f * (i + 1);
      const pg = ctx.createGain();
      pg.gain.value = partialGains[i];
      osc.connect(pg);
      pg.connect(lpf);
      osc.start();
      partials.push(osc);
    }

    lpf.connect(breath);
    breath.connect(out);
    out.connect(this.reverb);
    out.connect(this.dry);

    return {
      partials,
      lpf,
      breath,
      out,
      offset: Math.random(), // staggered breathing across the ensemble
      degree,
      level: 0,
    };
  }

  /** Called every animation frame with the wall-clock phase. Writes the
   *  breathing amplitude for every voice and returns the live levels for the
   *  visual score. */
  tickBreath(phase: number): Map<string, number> {
    const now = this.ctx.currentTime;
    const levels = new Map<string, number>();
    for (const [id, v] of this.voices) {
      const g = breathGain(phase, v.offset) * 0.18 * (0.5 + this.field.density * 0.5);
      v.breath.gain.setTargetAtTime(g, now, GAIN_GLIDE);
      v.level = g / 0.18; // normalize ~0..1 for the visual
      levels.set(id, v.level);
    }
    return levels;
  }

  dispose() {
    for (const v of this.voices.values()) v.partials.forEach((o) => o.stop());
    this.voices.clear();
    void this.ctx.close();
  }
}

/** Decaying, low-passed noise impulse response — a synthesized hall, no files. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      lp = lp * 0.78 + white * 0.22; // crude one-pole lowpass → darker tail
      data[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
