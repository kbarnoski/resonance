// Web Audio realisation of the deep-time engine. Six sustained sine/triangle
// voices through a shared low-pass, summed into a soft tanh limiter, master
// gain ≤ 0.15. Every value is set with setTargetAtTime so nothing clicks —
// and everything moves slowly anyway. No npm deps, no scale quantisation:
// voices glide to whatever continuous frequency the engine reports.

import { VOICE_COUNT, type DeepTimeState } from "./engine";

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode; // a second, slightly detuned osc for warmth
  gain: GainNode;
}

export class LongNowAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private voices: Voice[] = [];
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // Soft tanh limiter so nothing can ever spike.
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeTanhCurve();
    this.shaper.oversample = "2x";

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.4;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;

    this.filter.connect(this.shaper);
    this.shaper.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  /** Build and start the six voices. Call from a user gesture. */
  start(initial: DeepTimeState): void {
    if (this.started) return;
    this.started = true;

    for (let v = 0; v < VOICE_COUNT; v++) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;

      const osc = this.ctx.createOscillator();
      osc.type = v < 3 ? "sine" : "triangle";
      osc.frequency.value = initial.voices[v].freq;

      const detune = this.ctx.createOscillator();
      detune.type = "sine";
      detune.frequency.value = initial.voices[v].freq * 1.004;

      const detuneGain = this.ctx.createGain();
      detuneGain.gain.value = 0.5;

      osc.connect(gain);
      detune.connect(detuneGain);
      detuneGain.connect(gain);
      gain.connect(this.filter);

      osc.start();
      detune.start();
      this.voices.push({ osc, detune, gain });
    }

    // Ease the master in over a couple of seconds.
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.14, t, 1.2);
  }

  /** Push a fresh deep-time state into the running graph (called each frame). */
  update(state: DeepTimeState): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    // Per-voice gains sum to a controlled level regardless of how many swell.
    const norm = 1 / VOICE_COUNT;
    for (let v = 0; v < VOICE_COUNT; v++) {
      const vs = state.voices[v];
      const voice = this.voices[v];
      voice.osc.frequency.setTargetAtTime(vs.freq, t, 0.4);
      voice.detune.frequency.setTargetAtTime(vs.freq * 1.004, t, 0.4);
      voice.gain.gain.setTargetAtTime(Math.max(0.0001, vs.gain * norm), t, 0.5);
    }
    const cutoff = 480 + state.brightness * 1400;
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.6);
  }

  async dispose(): Promise<void> {
    try {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(0.0, t, 0.3);
      for (const v of this.voices) {
        try {
          v.osc.stop(t + 0.6);
          v.detune.stop(t + 0.6);
        } catch {
          /* already stopped */
        }
      }
      this.voices = [];
      await this.ctx.close();
    } catch {
      /* context already closed */
    }
  }
}

/** A tanh transfer curve for the master limiter — gentle, symmetric. */
function makeTanhCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 2.2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}
