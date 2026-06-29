// ════════════════════════════════════════════════════════════════════════════
// audio.ts — the GENERATIVE DRONE BANK (Web Audio).
//
// A meditative, cosmic-ambient drone — no harsh tones:
//   - detuned sustained oscillator layers (sine + a soft saw an octave up),
//     tuned to a low drone root with slow per-voice detune LFOs (beating),
//   - a low-pass filter that BREATHES open/closed at ~0.1 Hz (≈5.5/min, a calm
//     breath pace),
//   - a simple feedback-delay "void" tail for depth (no external IR needed),
//   - a master amplitude that is PHASE-LOCKED to the light pulse: the page hands
//     this engine the same flicker level each frame, so light and sound rise and
//     fall together — that coherence is part of the entrainment feel.
//
// The AudioContext is exposed so flicker.ts can clock off the same sample clock.
// ════════════════════════════════════════════════════════════════════════════

type Voice = {
  osc: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  gain: GainNode;
};

export class DreamAudioEngine {
  private ctx: AudioContext;
  private master: GainNode; // overall arc/drone swell
  private pulseGain: GainNode; // phase-locked to the light (set per frame)
  private filter: BiquadFilterNode;
  private breathLfo: OscillatorNode;
  private breathDepth: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private voices: Voice[] = [];
  private running = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // signal chain: voices -> filter -> (+delay tail) -> pulseGain -> master -> out
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    this.pulseGain = this.ctx.createGain();
    this.pulseGain.gain.value = 1;
    this.pulseGain.connect(this.master);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.pulseGain);

    // breathing low-pass: LFO modulates cutoff at ~0.1 Hz (~5.5 breaths/min)
    this.breathLfo = this.ctx.createOscillator();
    this.breathLfo.type = "sine";
    this.breathLfo.frequency.value = 0.092; // ~5.5/min
    this.breathDepth = this.ctx.createGain();
    this.breathDepth.gain.value = 420; // cutoff sweeps ~180..1020 Hz
    this.breathLfo.connect(this.breathDepth);
    this.breathDepth.connect(this.filter.frequency);
    this.breathLfo.start();

    // simple feedback-delay "void" tail
    this.delay = this.ctx.createDelay(5.0);
    this.delay.delayTime.value = 0.66;
    this.feedback = this.ctx.createGain();
    this.feedback.gain.value = 0.45;
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.pulseGain);
  }

  /** Shared sample clock for phase-locking the flicker engine. */
  getContext(): AudioContext {
    return this.ctx;
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.running) return;

    // low drone root (~A1 region) with stacked, detuned partials — soft & warm
    const root = 55; // A1
    const specs: { ratio: number; type: OscillatorType; gain: number }[] = [
      { ratio: 1.0, type: "sine", gain: 0.5 },
      { ratio: 1.5, type: "sine", gain: 0.28 }, // perfect fifth
      { ratio: 2.0, type: "sine", gain: 0.22 },
      { ratio: 2.0, type: "sawtooth", gain: 0.06 }, // faint harmonic shimmer (filtered)
      { ratio: 3.0, type: "sine", gain: 0.12 },
    ];

    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const osc = this.ctx.createOscillator();
      osc.type = s.type;
      osc.frequency.value = root * s.ratio;

      // slow detune LFO -> gentle beating between layers (no harshness)
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.017;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 4 + i * 2; // cents of slow wobble
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);

      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.filter);

      osc.start();
      lfo.start();
      // ease each layer in
      gain.gain.setTargetAtTime(s.gain, this.ctx.currentTime, 3.0);

      this.voices.push({ osc, lfo, lfoGain, gain });
    }

    this.running = true;
  }

  /**
   * Per-frame update. `level` is the SAME 0..1 luminance value the light is
   * using this frame (phase-lock), `swell` is the arc's 0..1 drone weight.
   */
  update(level: number, swell: number): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    // master follows the arc swell (gentle, eased)
    this.master.gain.setTargetAtTime(0.5 * Math.max(0, Math.min(1, swell)), now, 0.4);
    // amplitude pulses WITH the light — but keep a floor so it never gates fully
    const amp = 0.6 + 0.4 * Math.max(0, Math.min(1, level));
    this.pulseGain.gain.setTargetAtTime(amp, now, 0.05);
  }

  /** Ease the whole drone to silence (used on STOP) but keep nodes alive. */
  hush(): void {
    if (!this.running) return;
    this.master.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.6);
  }

  dispose(): void {
    try {
      for (const v of this.voices) {
        try {
          v.osc.stop();
          v.lfo.stop();
        } catch {
          /* already stopped */
        }
        v.osc.disconnect();
        v.lfo.disconnect();
        v.lfoGain.disconnect();
        v.gain.disconnect();
      }
      this.voices = [];
      try {
        this.breathLfo.stop();
      } catch {
        /* already stopped */
      }
      this.breathLfo.disconnect();
      this.breathDepth.disconnect();
      this.filter.disconnect();
      this.delay.disconnect();
      this.feedback.disconnect();
      this.pulseGain.disconnect();
      this.master.disconnect();
      void this.ctx.close();
    } catch {
      /* best-effort teardown */
    }
  }
}
