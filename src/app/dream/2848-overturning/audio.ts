// ─────────────────────────────────────────────────────────────────────────────
// 2848-overturning — the sonification engine (real Web Audio, no stubs).
//
// The layered ocean, voiced continuously (NEVER snapped to a scale / JI /
// pentatonic — the approach to collapse is allowed to sound genuinely rough):
//
//   • DEEP abyssal overturning drone  ← q   (twin oscillators; detune into
//        audible BEATING as resilience drops → the drone "loses its footing")
//   • MID thermocline voice           ← ΔT  (the thermal engine)
//   • SURFACE salinity voice          ← ΔS  (rises and takes over on collapse)
//   • TURBULENCE bed                  ← 1−resilience (band-passed noise swells)
//   • a feedback delay whose tail LENGTHENS as the system loses resilience.
//
// The shutdown is a decisive phase transition: the deep drone collapses and
// drops an octave rather than fading. Near the fold, flickering stutters the
// deep gain between the on/off basins. Signal path:
//   [voices + noise] → delay(mix) → compressor(limiter) → master(≤0.16) → out
// ─────────────────────────────────────────────────────────────────────────────

import type { Snapshot } from "./engine";

const MASTER = 0.15;
const GLIDE = 0.18; // setTargetAtTime time-constant (s)

// Continuous frequency map: freq = f0 · 2^(k · norm). No quantization.
function freqFromNorm(f0: number, k: number, norm: number): number {
  return f0 * Math.pow(2, k * norm);
}

export class OverturningAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;

  // deep overturning drone — twin detuning oscillators
  private deepA: OscillatorNode;
  private deepB: OscillatorNode;
  private deepGain: GainNode;
  private deepFilter: BiquadFilterNode;

  // mid thermocline voice
  private midOsc: OscillatorNode;
  private midGain: GainNode;

  // surface salinity voice (twin, brightens on collapse)
  private surfA: OscillatorNode;
  private surfB: OscillatorNode;
  private surfGain: GainNode;

  // turbulence bed
  private noiseSrc: AudioBufferSourceNode;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;

  // resilience-driven reverb-ish tail
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;

  private started = false;

  constructor(rng: () => number) {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.35;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // feedback delay (lengthening tails)
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.33;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.2;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.comp);

    const sink = (n: AudioNode) => {
      n.connect(this.comp);
      n.connect(this.delay);
    };

    // ── deep overturning drone ──
    this.deepFilter = ctx.createBiquadFilter();
    this.deepFilter.type = "lowpass";
    this.deepFilter.frequency.value = 420;
    this.deepFilter.Q.value = 0.7;
    this.deepGain = ctx.createGain();
    this.deepGain.gain.value = 0.0001;
    this.deepA = ctx.createOscillator();
    this.deepB = ctx.createOscillator();
    this.deepA.type = "sawtooth";
    this.deepB.type = "sawtooth";
    this.deepA.frequency.value = 55;
    this.deepB.frequency.value = 55;
    this.deepA.connect(this.deepFilter);
    this.deepB.connect(this.deepFilter);
    this.deepFilter.connect(this.deepGain);
    sink(this.deepGain);

    // ── mid thermocline voice ──
    this.midGain = ctx.createGain();
    this.midGain.gain.value = 0.0001;
    this.midOsc = ctx.createOscillator();
    this.midOsc.type = "triangle";
    this.midOsc.frequency.value = 220;
    this.midOsc.connect(this.midGain);
    sink(this.midGain);

    // ── surface salinity voice ──
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0.0001;
    this.surfA = ctx.createOscillator();
    this.surfB = ctx.createOscillator();
    this.surfA.type = "sine";
    this.surfB.type = "sine";
    this.surfA.frequency.value = 440;
    this.surfB.frequency.value = 442;
    this.surfA.connect(this.surfGain);
    this.surfB.connect(this.surfGain);
    sink(this.surfGain);

    // ── turbulence bed (seeded noise) ──
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 180;
    this.noiseFilter.Q.value = 1.2;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0001;
    this.noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    sink(this.noiseGain);

    this.deepA.start(now);
    this.deepB.start(now);
    this.midOsc.start(now);
    this.surfA.start(now);
    this.surfB.start(now);
    this.noiseSrc.start(now);
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      const t = this.ctx.currentTime;
      this.master.gain.setValueAtTime(0.0001, t);
      this.master.gain.exponentialRampToValueAtTime(MASTER, t + 3);
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx.state === "running") await this.ctx.suspend();
  }
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  private set(p: AudioParam, v: number, tc = GLIDE): void {
    p.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  update(s: Snapshot): void {
    if (!this.started) return;

    const instab = 1 - s.resilience; // 0 = resilient, 1 = at the fold
    const qOn = Math.max(0, s.q); // overturning present (on-state)
    const qNorm = Math.max(-0.5, Math.min(1.2, s.q));

    // DEEP drone: pitch tracks q continuously; on collapse it drops ~an octave.
    const deepF = freqFromNorm(46, 0.55, qNorm);
    this.set(this.deepA.frequency, deepF);
    // twin detune grows with instability → audible beating; bends off-integer.
    const detune = 0.6 + instab * 14 + s.flicker * 10;
    this.set(this.deepB.frequency, deepF * (1 + detune / 1000));
    // deep gain: strong when overturning, collapses (not fades) in off-state.
    const deepLevel = 0.34 * Math.max(0, Math.min(1, (s.q - 0.05) / 0.9));
    // flickering stutters the gain between basins (audio only, no visual strobe)
    const stutter = s.flicker > 0.15 ? 0.5 + 0.5 * Math.sin(s.progress * 900) : 1;
    this.set(this.deepGain.gain, Math.max(0.0001, deepLevel * stutter), 0.05);
    // filter opens as it destabilizes → grittier
    this.set(this.deepFilter.frequency, 300 + instab * 900 + qOn * 200);
    this.set(this.deepFilter.Q, 0.6 + instab * 3);

    // MID thermocline voice ← ΔT (x). Continuous, slow.
    const midNorm = Math.max(-1, Math.min(1, (s.x - 2) / 1.5));
    this.set(this.midOsc.frequency, freqFromNorm(146, 0.5, midNorm));
    this.set(this.midGain.gain, 0.05 + 0.06 * Math.max(0, s.resilience));

    // SURFACE salinity voice ← ΔS (y). Rises and TAKES OVER on collapse.
    const surfNorm = Math.max(-1, Math.min(1.5, (s.y - 1) / 1.5));
    const surfF = freqFromNorm(392, 0.42, surfNorm);
    this.set(this.surfA.frequency, surfF);
    this.set(this.surfB.frequency, surfF * (1 + (2 + instab * 8) / 1000));
    const surfLevel = 0.06 + 0.14 * Math.max(0, Math.min(1, (0.4 - s.q) / 0.6));
    this.set(this.surfGain.gain, surfLevel);

    // TURBULENCE bed rises as resilience drops.
    this.set(this.noiseGain.gain, 0.004 + instab * instab * 0.09);
    this.set(this.noiseFilter.frequency, 120 + instab * 260);

    // reverb tail LENGTHENS as it loses resilience.
    this.set(this.feedback.gain, 0.18 + instab * 0.55, 0.4);
    this.set(this.wet.gain, 0.3 + instab * 0.25, 0.4);
  }

  dispose(): void {
    try {
      this.deepA.stop();
      this.deepB.stop();
      this.midOsc.stop();
      this.surfA.stop();
      this.surfB.stop();
      this.noiseSrc.stop();
    } catch {
      // already stopped
    }
    try {
      this.master.disconnect();
    } catch {
      // already disconnected
    }
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}
