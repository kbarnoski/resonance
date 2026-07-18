// audio.ts — the additive "connectome-harmonics" drone.
//
// A bank of up to MAX_NODES sine partials, one per graph-Laplacian eigenvalue.
// When the slime rewires, graph.eigenToFreqs() hands us a new set of
// frequencies and we glide the partials to them (setTargetAtTime), so the
// chord morphs continuously — never quantized, never pentatonic.
//
// A quiet filtered-noise "static wash" runs underneath at all times once
// started: this is the formless-field sound you hear when no nodes are
// connected. New edges ring a soft bell; broken edges a soft damp.
//
// Safety: master gain ≤ 0.18 behind a DynamicsCompressor, 1 s fade-in, and the
// context stays suspended (silent) until the first user gesture.

import { MAX_NODES } from "./graph";

const MASTER_CEILING = 0.18;

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
}

export class SlimeAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private bus: GainNode; // partials + bells sum here
  private partials: Partial[] = [];
  private wash: GainNode;
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.02;
    this.compressor.release.value = 0.3;

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.ctx.destination);

    // Additive bank: one partial per possible eigenvalue.
    for (let i = 0; i < MAX_NODES; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 110;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.bus);
      osc.start();
      this.partials.push({ osc, gain });
    }

    // Formless static wash: looped filtered noise, always faintly present.
    this.wash = this.ctx.createGain();
    this.wash.gain.value = 0.05;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.makeNoise();
    noise.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    lp.Q.value = 0.6;
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 48;
    const subG = this.ctx.createGain();
    subG.gain.value = 0.12;
    noise.connect(lp);
    lp.connect(this.wash);
    sub.connect(subG);
    subG.connect(this.wash);
    this.wash.connect(this.bus);
    noise.start();
    sub.start();
  }

  private makeNoise(): AudioBuffer {
    // Deterministic brown-ish noise (fixed coefficients, no PRNG needed for a
    // texture bed; correlated so it reads as a low wash, not hiss).
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      // Sum of a few slow incommensurate sines → smooth pseudo-noise bed.
      phase += 1;
      const n =
        Math.sin(phase * 0.0011) * 0.5 +
        Math.sin(phase * 0.0027) * 0.3 +
        Math.sin(phase * 0.0069) * 0.2;
      last = last * 0.96 + n * 0.04;
      d[i] = last * 0.9;
    }
    return buf;
  }

  /** Resume + fade in. Call from the first user gesture. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER_CEILING, now + 1.0);
  }

  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Retune the additive bank to a new set of partial frequencies (from
   * eigenToFreqs). Lower modes are louder; unused partials fade to silence.
   * `energy` (0..1) — how much of the field is actually connected — sets the
   * overall drone level over the wash.
   */
  setSpectrum(freqs: number[], energy: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const n = Math.min(freqs.length, this.partials.length);
    const drone = 0.5 + 0.5 * Math.min(1, energy);
    for (let i = 0; i < this.partials.length; i++) {
      const p = this.partials[i];
      if (i < n && freqs[i] > 0) {
        p.osc.frequency.setTargetAtTime(freqs[i], now, 0.25);
        // 1/(i+1) rolloff keeps the fundamental dominant and the stack soft.
        const amp = (0.16 / (i + 1)) * drone;
        p.gain.gain.setTargetAtTime(amp, now, 0.35);
      } else {
        p.gain.gain.setTargetAtTime(0, now, 0.4);
      }
    }
    // When the field is empty/formless, lean on the wash; when richly
    // connected, pull it back so the harmony reads clearly.
    this.wash.gain.setTargetAtTime(0.02 + 0.06 * (1 - Math.min(1, energy)), now, 0.5);
  }

  /** Soft consonant bell when a new vein connects two nodes. */
  ringBell(freq: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = Math.max(120, Math.min(1400, freq));
    const partial2 = this.ctx.createOscillator();
    partial2.type = "sine";
    partial2.frequency.value = osc.frequency.value * 2.01;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.09, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.6);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.35;
    osc.connect(g);
    partial2.connect(g2);
    g2.connect(g);
    g.connect(this.bus);
    osc.start(now);
    partial2.start(now);
    osc.stop(now + 1.7);
    partial2.stop(now + 1.7);
  }

  /** Soft low damp when a vein breaks. */
  damp(freq: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(Math.max(70, Math.min(400, freq * 0.5)), now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.06, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.8);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    osc.start(now);
    osc.stop(now + 0.85);
  }

  async close(): Promise<void> {
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
