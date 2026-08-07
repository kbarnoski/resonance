// 7848-latents — the continuous morphing Web-Audio synth.
//
// A three-voice pad glides through a lowpass filter and a tremolo whose depth
// and rate come from the field. Chord character (major → minor → cluster), root
// pitch, brightness and density are all read continuously from wherever the
// token sits — so moving through the field morphs the sound smoothly. Marker
// crossings fire a short plucked note, turning the authored loop into an
// audible, repeating phrase.
//
// No Math.random / Date.now. Timing uses the AudioContext clock.

import type { FieldSample } from "./field";

/** Pentatonic degrees over two octaves — keeps discovered pitches musical. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE_HZ = 146.83; // D3

function quantize(pitch01: number): number {
  const i = Math.min(SCALE.length - 1, Math.floor(pitch01 * SCALE.length));
  return BASE_HZ * Math.pow(2, SCALE[i] / 12);
}

/** Chord intervals (semitones) as a continuous function of tension. */
function chordSemis(tension: number): [number, number, number] {
  // t=0 major [0,4,7] · t=0.5 minor [0,3,7] · t=1 cluster [0,1,2]
  let third: number;
  let fifth: number;
  if (tension < 0.5) {
    const k = tension / 0.5;
    third = 4 + (3 - 4) * k;
    fifth = 7;
  } else {
    const k = (tension - 0.5) / 0.5;
    third = 3 + (1 - 3) * k;
    fifth = 7 + (2 - 7) * k;
  }
  return [0, third, fifth];
}

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private trem: GainNode; // tremolo VCA
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;
  private padGain: GainNode;
  private voices: OscillatorNode[] = [];
  private started = false;
  private cur: FieldSample = {
    brightness: 0.5,
    tension: 0.3,
    pulse: 0.3,
    density: 0.5,
    pitch: 0.5,
  };

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.trem = this.ctx.createGain();
    this.trem.gain.value = 1;
    this.trem.connect(this.master);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.trem);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padGain.connect(this.filter);

    // Three detuned oscillators form the morphing chord.
    const shapes: OscillatorType[] = ["sawtooth", "triangle", "triangle"];
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = shapes[i];
      o.frequency.value = 220;
      o.detune.value = (i - 1) * 5;
      o.connect(this.padGain);
      this.voices.push(o);
    }

    // Tremolo LFO modulates the VCA gain.
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 3;
    this.lfoDepth = this.ctx.createGain();
    this.lfoDepth.gain.value = 0.2;
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.trem.gain);
  }

  /** Resume + start oscillators. Call from a user gesture (autoplay policy). */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    for (const o of this.voices) o.start(t);
    this.lfo.start(t);
    // fade the pad in
    this.padGain.gain.setTargetAtTime(0.09, t, 0.4);
    this.setField(this.cur);
  }

  get running(): boolean {
    return this.started && this.ctx.state === "running";
  }

  /** Continuously morph every parameter toward the field sample at the token. */
  setField(s: FieldSample): void {
    this.cur = s;
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const tc = 0.08;

    const root = quantize(s.pitch);
    const semis = chordSemis(s.tension);
    for (let i = 0; i < this.voices.length; i++) {
      const f = root * Math.pow(2, semis[i] / 12);
      this.voices[i].frequency.setTargetAtTime(f, t, tc);
    }

    // brightness → cutoff (≈220 Hz .. 6.4 kHz)
    const cutoff = 220 * Math.pow(2, s.brightness * 4.85);
    this.filter.frequency.setTargetAtTime(cutoff, t, tc);

    // pulse → tremolo rate (0.6 .. 8 Hz), density → tremolo depth + pad level
    this.lfo.frequency.setTargetAtTime(0.6 + s.pulse * 7.4, t, tc);
    const depth = 0.1 + s.density * 0.4;
    this.lfoDepth.gain.setTargetAtTime(depth, t, tc);
    this.trem.gain.setTargetAtTime(1 - depth, t, tc);
    this.padGain.gain.setTargetAtTime(0.05 + s.density * 0.06, t, tc);
  }

  /** Fire a short plucked note — used when the loop crosses a marker. */
  pluck(s: FieldSample): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const root = quantize(s.pitch) * 2; // an octave up, sits above the pad
    const semis = chordSemis(s.tension);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 + s.brightness * 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);

    const bp = this.ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 600 + s.brightness * 4200;
    bp.Q.value = 1.2;
    bp.connect(g);
    g.connect(this.master);

    // root + third → a little harmonic bite that tracks the local chord
    const offsets = [0, semis[1]];
    const osc: OscillatorNode[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? "triangle" : "sine";
      o.frequency.value = root * Math.pow(2, offsets[i] / 12);
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.46);
      osc.push(o);
    }
    const done = () => {
      g.disconnect();
      bp.disconnect();
    };
    osc[osc.length - 1].onended = done;
  }

  async dispose(): Promise<void> {
    try {
      const t = this.ctx.currentTime;
      this.padGain.gain.setTargetAtTime(0.0001, t, 0.1);
      for (const o of this.voices) {
        try {
          o.stop(t + 0.3);
        } catch {
          /* already stopped */
        }
      }
      try {
        this.lfo.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
      await this.ctx.close();
    } catch {
      /* context already closed */
    }
  }
}
