// Choir synth + kids-safe master chain + Kodály call-and-response echo.
//
// Mandatory safe chain:
//   voices -> masterGain (<=0.28) -> lowpass (<=7000 Hz)
//          -> DynamicsCompressor(-10, 20:1) -> destination
// Plus an always-on soft open-fifth drone (C + G) so it is never silent.

import { type Degree, DEGREE_SEMITONE } from "./classify";

const A4 = 440;
// C4 is 9 semitones below A4. We sing the scale in the C4 octave by default.
const C4 = A4 * Math.pow(2, -9 / 12);

function semitoneToHz(semi: number, octave: number): number {
  return C4 * Math.pow(2, (semi + octave * 12) / 12);
}

interface VoiceNode {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  formant: BiquadFilterNode;
}

export interface EchoNote {
  degree: Degree;
  octave: number;
}

export class ChoirAudio {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private master: GainNode;
  private voices: Map<Degree, VoiceNode> = new Map();
  private droneOscs: OscillatorNode[] = [];
  private active: Degree | null = null;
  private history: EchoNote[] = [];
  private echoTimers: number[] = [];

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6500; // <= 7000 Hz, soft top
    lowpass.Q.value = 0.5;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 20;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    // Analyser taps the master (read-only); it never routes to output.
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;

    this.master.connect(lowpass);
    this.master.connect(this.analyser);
    lowpass.connect(comp);
    comp.connect(this.ctx.destination);

    this.buildVoices();
    this.buildDrone();
  }

  async resume() {
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    // Fade master up gently to a kid-safe ceiling.
    this.master.gain.setTargetAtTime(0.26, this.ctx.currentTime, 0.8);
  }

  private buildVoices() {
    const degrees = Object.keys(DEGREE_SEMITONE) as Degree[];
    for (const d of degrees) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      const osc2 = this.ctx.createOscillator();
      osc2.type = "sine";
      osc2.detune.value = 5;

      // A gentle vowel-ish formant for a choral "oo/ah" colour.
      const formant = this.ctx.createBiquadFilter();
      formant.type = "lowpass";
      formant.frequency.value = 1200;
      formant.Q.value = 0.7;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;

      osc.connect(formant);
      osc2.connect(formant);
      formant.connect(gain);
      gain.connect(this.master);

      const hz = semitoneToHz(DEGREE_SEMITONE[d], 0);
      osc.frequency.value = hz;
      osc2.frequency.value = hz;
      osc.start();
      osc2.start();

      this.voices.set(d, { osc, osc2, gain, formant });
    }
  }

  private buildDrone() {
    // Soft open fifth: C2 + G2, very quiet, always on.
    const freqs = [semitoneToHz(0, -2), semitoneToHz(7, -2)];
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.05;
    droneGain.connect(this.master);
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(droneGain);
      o.start();
      this.droneOscs.push(o);
    }
  }

  // Ring a degree (held while the sign is held). octave shifts pitch up/down,
  // brightness opens the formant. 0 = base octave.
  ring(degree: Degree, octave: number, brightness: number) {
    this.cancelEcho();
    const v = this.voices.get(degree);
    if (!v) return;
    const t = this.ctx.currentTime;
    const hz = semitoneToHz(DEGREE_SEMITONE[degree], octave);
    v.osc.frequency.setTargetAtTime(hz, t, 0.04);
    v.osc2.frequency.setTargetAtTime(hz, t, 0.04);
    v.formant.frequency.setTargetAtTime(900 + brightness * 2200, t, 0.08);

    if (degree !== this.active) {
      // Silence the previously active voice gently.
      if (this.active) this.silence(this.active);
      this.active = degree;
      // Record into the melody history (cap at recent notes).
      this.history.push({ degree, octave });
      if (this.history.length > 12) this.history.shift();
    }
    // Gentle attack to a held level (>= 40ms).
    v.gain.gain.setTargetAtTime(0.2, t, 0.06);
  }

  // Release the currently-ringing voice (sign let go / hand absent).
  release() {
    if (this.active) {
      this.silence(this.active);
      this.active = null;
    }
  }

  private silence(degree: Degree) {
    const v = this.voices.get(degree);
    if (!v) return;
    v.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
  }

  // Kodály echo: replay the last few signed notes as a gentle little tune.
  playEcho() {
    this.cancelEcho();
    const notes = this.history.slice(-6);
    if (notes.length === 0) return;
    const step = 0.55; // seconds per note
    notes.forEach((n, i) => {
      const onTimer = window.setTimeout(() => {
        const v = this.voices.get(n.degree);
        if (!v) return;
        const t = this.ctx.currentTime;
        const hz = semitoneToHz(DEGREE_SEMITONE[n.degree], n.octave);
        v.osc.frequency.setTargetAtTime(hz, t, 0.03);
        v.osc2.frequency.setTargetAtTime(hz, t, 0.03);
        v.formant.frequency.setTargetAtTime(1500, t, 0.05);
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0.18, t, 0.05);
        v.gain.gain.setTargetAtTime(0.0001, t + step * 0.7, 0.1);
        this.echoActiveDegree = n.degree;
      }, i * step * 1000);
      this.echoTimers.push(onTimer);
    });
    const endTimer = window.setTimeout(
      () => {
        this.echoActiveDegree = null;
      },
      notes.length * step * 1000 + 300,
    );
    this.echoTimers.push(endTimer);
  }

  // Lets the scene glow the orb the echo is currently singing.
  echoActiveDegree: Degree | null = null;

  cancelEcho() {
    for (const id of this.echoTimers) window.clearTimeout(id);
    this.echoTimers = [];
    this.echoActiveDegree = null;
  }

  get level(): number {
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i];
    return s / (buf.length * 255);
  }

  async dispose() {
    this.cancelEcho();
    for (const v of this.voices.values()) {
      try {
        v.osc.stop();
        v.osc2.stop();
      } catch {
        /* ignore */
      }
    }
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
