/**
 * The shared harmonic field for `6664-cohere`.
 *
 * The sounding chord is a pure function of BOTH orbs — `computeChord(a, b)`.
 * Because both browsers receive both positions and run this exact function,
 * they synthesize the identical harmony (control-signals-not-audio). The music
 * literally cannot be authored alone: orb A (lower) sets the fundamental and
 * the lower dyad; orb B (upper) sets the upper voice, register and timbre; and
 * the INTERVAL between them slides the whole field from consonance to tension.
 *
 * `PadEngine` renders that chord as a warm, continuously sustained pad through
 * a lowpass and a generated-impulse reverb, gliding every parameter so nothing
 * clicks as the orbs move.
 */

import { mulberry32 } from "./net";

export interface Orb {
  x: number; // 0..1 across the field
  y: number; // 0..1 down the field (0 = top / higher register)
}

export interface Chord {
  freqs: {
    drone: number;
    root: number;
    fifth: number;
    top: number;
    shimmer: number;
    tension: number;
  };
  proximity: number; // 1 = orbs together (bloom), 0 = far apart (strain)
  strain: number; // 1 - proximity
  cutoff: number; // lowpass Hz
  detune: number; // saw spread, cents
  intervalName: string;
  chordName: string;
  tense: boolean;
}

/* Lydian scale — the raised 4th keeps roots from souring against the field. */
const SCALE = [0, 2, 4, 6, 7, 9, 11];

const INTERVAL_NAMES = [
  "Unison",
  "Minor 2nd",
  "Major 2nd",
  "Minor 3rd",
  "Major 3rd",
  "Perfect 4th",
  "Tritone",
  "Perfect 5th",
  "Minor 6th",
  "Major 6th",
  "Minor 7th",
  "Major 7th",
];
const INTERVAL_TENSE = [
  false, true, false, false, false, false, true, false, false, false, true, true,
];
const PITCH_CLASS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function degToSemi(idx: number): number {
  const oct = Math.floor(idx / 7);
  const d = ((idx % 7) + 7) % 7;
  return oct * 12 + SCALE[d];
}

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** The one function that both peers evaluate — chord = f(both positions). */
export function computeChord(a: Orb, b: Orb): Chord {
  const rootIdx = Math.round(a.x * 12);
  const topIdx = Math.round(b.x * 12);
  const rootReg = Math.round((1 - a.y) * 2); // 0..2 octaves
  const topReg = Math.round((1 - b.y) * 2);

  const rootMidi = 38 + degToSemi(rootIdx) + rootReg * 12; // ~D2 base (lower)
  const topMidi = 50 + degToSemi(topIdx) + topReg * 12; // ~D3 base (upper)

  const interval = (((topMidi - rootMidi) % 12) + 12) % 12;
  const intervalName = INTERVAL_NAMES[interval];
  const tense = INTERVAL_TENSE[interval];

  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  const proximity = Math.max(0, Math.min(1, 1 - dist / 0.9));
  const strain = 1 - proximity;

  const brightness = 1 - b.y; // upper orb high on screen → brighter
  const cutoff = 320 + brightness * 3000 + proximity * 1600;
  const detune = 6 + strain * 22;

  const rootPc = ((rootMidi % 12) + 12) % 12;
  const chordName = `${PITCH_CLASS[rootPc]} · ${intervalName}${tense ? " (tension)" : ""}`;

  return {
    freqs: {
      drone: midiToFreq(rootMidi - 12),
      root: midiToFreq(rootMidi),
      fifth: midiToFreq(rootMidi + 7),
      top: midiToFreq(topMidi),
      shimmer: midiToFreq(topMidi + 12),
      tension: midiToFreq(rootMidi + 6), // tritone partial, only heard when apart
    },
    proximity,
    strain,
    cutoff,
    detune,
    intervalName,
    chordName,
    tense,
  };
}

/* -------------------------------------------------------------------------- */
/* PadEngine                                                                  */
/* -------------------------------------------------------------------------- */

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode | null; // detuned partner for warmth
  gain: GainNode;
}

function makeReverbIR(ctx: AudioContext): AudioBuffer {
  const seconds = 2.6;
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const ir = ctx.createBuffer(2, len, rate);
  const rng = mulberry32(0x1eaf);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.4);
      data[i] = (rng() * 2 - 1) * decay;
    }
  }
  return ir;
}

export class PadEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private voices: Record<string, Voice> = {};

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 900;
    this.lowpass.Q.value = 0.6;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setTargetAtTime(0.5, now, 1.2); // fade in

    // Reverb send.
    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbIR(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;

    this.lowpass.connect(dry).connect(this.master);
    this.lowpass.connect(convolver).connect(wet).connect(this.master);
    this.master.connect(ctx.destination);

    // Warm detuned-saw voices + softer sine/tri colors.
    this.voices.drone = this.makeVoice("triangle", false, 0.18);
    this.voices.root = this.makeVoice("sawtooth", true, 0.14);
    this.voices.fifth = this.makeVoice("sawtooth", true, 0.1);
    this.voices.top = this.makeVoice("sawtooth", true, 0.12);
    this.voices.shimmer = this.makeVoice("triangle", false, 0.0);
    this.voices.tension = this.makeVoice("sine", false, 0.0);
  }

  private makeVoice(type: OscillatorType, detuned: boolean, level: number): Voice {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(this.lowpass);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = 220;
    osc.connect(gain);
    osc.start();

    let osc2: OscillatorNode | null = null;
    if (detuned) {
      osc2 = ctx.createOscillator();
      osc2.type = type;
      osc2.frequency.value = 220;
      osc2.detune.value = 8;
      osc2.connect(gain);
      osc2.start();
    }
    return { osc, osc2, gain };
  }

  /** Glide every parameter toward the freshly computed chord. */
  update(chord: Chord): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gl = 0.09; // glide time constant — smooth, no clicks

    const setV = (name: string, freq: number, gain: number, detune: number) => {
      const v = this.voices[name];
      if (!v) return;
      v.osc.frequency.setTargetAtTime(freq, t, gl);
      v.gain.gain.setTargetAtTime(gain, t, gl);
      if (v.osc2) {
        v.osc2.frequency.setTargetAtTime(freq, t, gl);
        v.osc2.detune.setTargetAtTime(detune, t, gl);
      }
    };

    const f = chord.freqs;
    setV("drone", f.drone, 0.18, 0);
    setV("root", f.root, 0.14, chord.detune);
    setV("fifth", f.fifth, 0.1 + chord.proximity * 0.03, chord.detune * 0.8);
    setV("top", f.top, 0.12, chord.detune);
    setV("shimmer", f.shimmer, 0.09 * chord.proximity, 0); // bloom together
    setV("tension", f.tension, 0.09 * chord.strain, 0); // strain apart

    this.lowpass.frequency.setTargetAtTime(chord.cutoff, t, gl);
  }

  dispose(): void {
    const t = this.ctx.currentTime;
    try {
      this.master.gain.setTargetAtTime(0.0001, t, 0.2);
    } catch {
      /* ignore */
    }
    for (const name of Object.keys(this.voices)) {
      const v = this.voices[name];
      try {
        v.osc.stop(t + 0.4);
        v.osc2?.stop(t + 0.4);
      } catch {
        /* ignore */
      }
    }
  }
}
