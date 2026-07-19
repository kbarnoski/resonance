// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the harmonic field. Web Audio API only. The MEANING chooses the
// sound: the reduced embedding gives a fundamental, a word-derived (non-lattice)
// partial set, a brightness tilt and an inharmonicity depth. Each partial is a
// small FM voice (carrier + modulator); brightness tilts the partial gains,
// inharmonicity opens the modulator depth and detunes the stack — so bright,
// noisy words sound bright & clangorous and calm words sound pure. No fixed
// just-intonation lattice anywhere; the scale itself morphs with the vector.
// ─────────────────────────────────────────────────────────────────────────────

import { N_PARTIALS, SemanticField } from "./chain";

interface Voice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  gain: GainNode;
}

const RAMP = 1.3; // seconds to morph between fields

export class ChoirAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private vibrato: OscillatorNode;
  private vibratoGain: GainNode;
  private voices: Voice[] = [];
  private analyser: AnalyserNode;
  private levelBuf: Uint8Array<ArrayBuffer>;
  private started = false;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.7;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    this.filter.connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(this.ctx.destination);

    // shared gentle vibrato across the stack
    this.vibrato = this.ctx.createOscillator();
    this.vibrato.frequency.value = 4.7;
    this.vibratoGain = this.ctx.createGain();
    this.vibratoGain.gain.value = 2.2;
    this.vibrato.connect(this.vibratoGain);
    this.vibrato.start();

    for (let i = 0; i < N_PARTIALS; i++) {
      const carrier = this.ctx.createOscillator();
      carrier.type = "sine";
      const mod = this.ctx.createOscillator();
      mod.type = "sine";
      const modGain = this.ctx.createGain();
      modGain.gain.value = 0;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      this.vibratoGain.connect(carrier.detune);
      carrier.connect(gain);
      gain.connect(this.filter);

      carrier.start();
      mod.start();
      this.voices.push({ carrier, mod, modGain, gain });
    }
  }

  /** Resume the context (must follow a user gesture) and fade the drone in. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.5, now + 1.4);
    }
  }

  /** Apply a semantic field: retune the stack, retilt the partial gains, and
   *  open/close the FM inharmonicity — all as a smooth crossfade. */
  applyField(f: SemanticField): void {
    const now = this.ctx.currentTime;
    const end = now + RAMP;

    // brightness → filter opens up; inharmonicity → resonant bite
    const cutoff = 380 * Math.pow(2, 1.0 + f.brightness * 4.5); // ~760..~8.5kHz
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    this.filter.frequency.linearRampToValueAtTime(cutoff, end);
    this.filter.Q.setTargetAtTime(0.5 + f.inharm * 3.5, now, 0.4);

    let total = 0;
    const tilt = 0.4 + f.brightness * 2.4; // >1 favours high partials
    const weights = f.ratios.map((_, i) =>
      Math.pow(i + 1, f.brightness > 0.5 ? tilt - 1.0 : -(1.6 - f.brightness)),
    );
    for (const w of weights) total += w;

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const ratio = f.ratios[i] ?? i + 1;
      const freq = f.root * ratio;

      v.carrier.frequency.cancelScheduledValues(now);
      v.carrier.frequency.setValueAtTime(v.carrier.frequency.value, now);
      v.carrier.frequency.linearRampToValueAtTime(freq, end);

      // modulator ratio & depth from inharmonicity → FM brightness/clang
      const modRatio = 1.0 + f.inharm * (1.5 + 0.5 * i);
      v.mod.frequency.setTargetAtTime(freq * modRatio, now, 0.3);
      const depth = f.inharm * freq * (0.6 + 0.5 * f.brightness);
      v.modGain.gain.cancelScheduledValues(now);
      v.modGain.gain.setValueAtTime(v.modGain.gain.value, now);
      v.modGain.gain.linearRampToValueAtTime(depth, end);

      const amp = (weights[i] / total) * 0.85;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(amp, end);
    }
  }

  /** Current output level 0..1 (drives the visual breathing). */
  level(): number {
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const s = (this.levelBuf[i] - 128) / 128;
      sum += s * s;
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 3.0);
  }

  dispose(): void {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.2);
      for (const v of this.voices) {
        v.carrier.stop(now + 0.3);
        v.mod.stop(now + 0.3);
      }
      this.vibrato.stop(now + 0.3);
      setTimeout(() => this.ctx.close().catch(() => {}), 400);
    } catch {
      this.ctx.close().catch(() => {});
    }
  }
}
