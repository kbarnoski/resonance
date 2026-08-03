// ─────────────────────────────────────────────────────────────────────────
// Audio — a warm tidal drone that breathes with you.
//
// Two coupled layers:
//   1. A low JUST-INTONATION pad (a slow, consonant chord built from small
//      whole-number ratios over a ~55 Hz root) — the durational bed, in the
//      register of Radigue's slow drones / Richter's "Sleep".
//   2. A filtered-noise "SURF": pink-ish noise through a lowpass whose cutoff
//      and level SWELL with the breath. Inhale opens the filter and lifts the
//      surf (brighter, nearer); exhale closes it (darker, receding).
//
// The breath level (0..1) is applied with slow ramps so the coupling is gentle
// and musical — never a stutter, always a swell.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = 55; // A1, a low warm fundamental
// Just-intonation swell: unison, octave, fifth, major tenth, and a soft
// two-octave shimmer. Small whole-number ratios => a beat-free, glassy calm.
const PARTIALS: { ratio: number; gain: number; type: OscillatorType }[] = [
  { ratio: 1 / 1, gain: 0.5, type: "sine" },
  { ratio: 2 / 1, gain: 0.28, type: "sine" },
  { ratio: 3 / 2, gain: 0.22, type: "sine" }, // fifth (x2 octave => 3/1 region)
  { ratio: 5 / 2, gain: 0.13, type: "sine" }, // major tenth
  { ratio: 4 / 1, gain: 0.08, type: "triangle" },
];

export class TideAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private padGain: GainNode;
  private oscs: OscillatorNode[] = [];
  private lfo?: OscillatorNode; // very slow pad-detune shimmer
  // Surf chain
  private surfSrc?: AudioBufferSourceNode;
  private surfFilter: BiquadFilterNode;
  private surfGain: GainNode;
  private started = false;

  constructor() {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Gentle overall warmth: roll off harsh highs on the whole mix.
    const tone = this.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 4200;
    tone.Q.value = 0.4;
    tone.connect(this.master);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.9;
    this.padGain.connect(tone);

    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.value = 0.0;
    this.surfFilter = this.ctx.createBiquadFilter();
    this.surfFilter.type = "lowpass";
    this.surfFilter.frequency.value = 300;
    this.surfFilter.Q.value = 0.7;
    this.surfFilter.connect(this.surfGain);
    this.surfGain.connect(tone);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;

    // Build the JI pad.
    for (const p of PARTIALS) {
      const osc = this.ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = ROOT * p.ratio;
      const g = this.ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(this.padGain);
      osc.start(now);
      this.oscs.push(osc);
    }

    // A near-inaudible slow LFO that detunes the pad a few cents — living, wet.
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = 0.05; // 20 s period
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 1.2; // cents
    this.lfo.connect(lfoGain);
    for (const osc of this.oscs) lfoGain.connect(osc.detune);
    this.lfo.start(now);

    // Surf: a looping buffer of soft pink-ish noise.
    this.surfSrc = this.ctx.createBufferSource();
    this.surfSrc.buffer = this.makeNoiseBuffer();
    this.surfSrc.loop = true;
    this.surfSrc.connect(this.surfFilter);
    this.surfSrc.start(now);

    // Fade the whole instrument up slowly (a rising tide, not a switch).
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.5, now + 6);
  }

  // Couple the breath (0..1) into the sound. Called every animation frame.
  breathe(level: number) {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const l = Math.max(0, Math.min(1, level));

    // Surf brightness: exhale ~260 Hz (dark, distant) -> inhale ~2000 Hz (open).
    const cutoff = 260 + l * l * 1740;
    // Surf level swells with inhale.
    const surf = 0.05 + l * 0.5;
    // Pad breathes subtly too, so the whole sea lifts a little on the inhale.
    const pad = 0.72 + l * 0.28;

    const t = 0.12; // ramp time — smooth, never zippery
    this.surfFilter.frequency.setTargetAtTime(cutoff, now, t);
    this.surfGain.gain.setTargetAtTime(surf * 0.7, now, t);
    this.padGain.gain.setTargetAtTime(pad, now, t);
  }

  private makeNoiseBuffer(): AudioBuffer {
    const seconds = 4;
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Simple pink-ish noise (Voss-ish one-pole cascade) for a soft surf hiss.
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      b2 = 0.57 * b2 + white * 1.0526;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12;
    }
    return buf;
  }

  async stop() {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 1.2);
    setTimeout(() => {
      try {
        this.oscs.forEach((o) => o.stop());
        this.lfo?.stop();
        this.surfSrc?.stop();
      } catch {
        // already stopped
      }
      void this.ctx.close();
    }, 1400);
  }
}
