// ════════════════════════════════════════════════════════════════════════════
// 2672 — SOMNUS · Web Audio synth
//
// Per-stage sonic register, free-chromatic (continuous Hz, NO 12-TET / JI /
// diatonic snapping — pitches arrive as raw Hz from the engine and are played
// verbatim). A persistent "bed" of oscillators carries the stage atmosphere
// (grinding delta sub in N3, airy detuned pad in REM, soft pad in Wake); one-
// shot voices carry motif statements, replays, dream splices and spindles.
// Dissonance is allowed — the bed detune and REM bends are deliberately rough.
// ════════════════════════════════════════════════════════════════════════════

import { mulberry32, SEED, type Note, type Stage, type Timbre } from "./engine";

interface BedTarget {
  root: number; // sub/root Hz
  beat: number; // second osc offset (Hz) — beating/grind amount
  gain: number;
  cutoff: number;
  wave: OscillatorType;
}

function bedForStage(stage: Stage): BedTarget {
  switch (stage) {
    case "N3":
      // deep delta drone + grind (close, beating oscillators)
      return { root: 46, beat: 2.7, gain: 0.5, cutoff: 220, wave: "sawtooth" };
    case "N2":
      // quiet high theta shimmer bed
      return { root: 174, beat: 0.6, gain: 0.14, cutoff: 1400, wave: "triangle" };
    case "REM":
      // mid airy, wider detune — dreamy, slightly clashing
      return { root: 138, beat: 4.2, gain: 0.24, cutoff: 900, wave: "sawtooth" };
    case "N1":
      return { root: 92, beat: 1.1, gain: 0.2, cutoff: 500, wave: "triangle" };
    case "WAKE":
    default:
      return { root: 110, beat: 0.9, gain: 0.16, cutoff: 700, wave: "triangle" };
  }
}

function waveForTimbre(tb: Timbre): OscillatorType {
  switch (tb) {
    case "wake":
      return "triangle";
    case "delta":
      return "sawtooth";
    case "dream":
      return "sawtooth";
    case "spindle":
      return "sine";
  }
}

export class SomnusAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private wet: GainNode;
  private reverb: ConvolverNode;
  private bedGain: GainNode;
  private bedFilter: BiquadFilterNode;
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private started = false;
  private muted = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // seeded reverb impulse (no Math.random)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 3.2, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);

    // persistent bed
    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = "lowpass";
    this.bedFilter.frequency.value = 500;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    this.bedFilter.connect(this.bedGain);
    this.bedGain.connect(this.master);
    this.bedGain.connect(this.reverb);

    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = "triangle";
    this.oscB.type = "triangle";
    this.oscA.frequency.value = 110;
    this.oscB.frequency.value = 110.9;
    this.oscA.connect(this.bedFilter);
    this.oscB.connect(this.bedFilter);
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.oscA.start();
    this.oscB.start();
    this.started = true;
  }

  setStage(stage: Stage): void {
    const b = bedForStage(stage);
    const now = this.ctx.currentTime;
    const g = this.muted ? 0 : b.gain;
    this.oscA.type = b.wave;
    this.oscB.type = b.wave;
    this.oscA.frequency.setTargetAtTime(b.root, now, 1.4);
    this.oscB.frequency.setTargetAtTime(b.root + b.beat, now, 1.4);
    this.bedFilter.frequency.setTargetAtTime(b.cutoff, now, 1.4);
    this.bedGain.gain.setTargetAtTime(g, now, 1.4);
  }

  playNote(n: Note, when: number): void {
    if (this.muted) return;
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime + 0.005);

    const osc = ctx.createOscillator();
    osc.type = waveForTimbre(n.timbre);
    osc.frequency.value = n.freq;
    if (n.detune) osc.detune.value = n.detune;

    const g = ctx.createGain();
    const peak = n.gain;
    const atk = n.timbre === "spindle" ? 0.006 : 0.02;
    const rel = n.timbre === "delta" ? 0.6 : n.timbre === "dream" ? 0.4 : 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + n.dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur + rel);

    const pan = ctx.createStereoPanner();
    pan.pan.value = n.pan;

    osc.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    // deep + dream voices get more reverb
    if (n.timbre === "delta" || n.timbre === "dream") pan.connect(this.reverb);

    osc.start(t);
    osc.stop(t + n.dur + rel + 0.05);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      pan.disconnect();
    };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.9, now, 0.08);
  }

  isMuted(): boolean {
    return this.muted;
  }

  async dispose(): Promise<void> {
    try {
      this.oscA.stop();
      this.oscB.stop();
    } catch {
      // already stopped
    }
    try {
      await this.ctx.close();
    } catch {
      // ignore
    }
  }
}

/** Seeded exponential-decay noise impulse for the convolver reverb. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const rng = mulberry32(SEED ^ 0x9e37);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
