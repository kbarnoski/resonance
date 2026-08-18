// ─────────────────────────────────────────────────────────────────────────────
// audioEngine.ts — plays ONE of Karel's real recordings and turns the live
// signal into band energies that force the schlieren field.
//
// The only sound is his decoded AudioBuffer, played through an
// AudioBufferSourceNode into the shared safeMaster ear-safety bus. There are no
// oscillators and no synthesized tones anywhere in this piece. Band energies and
// a simple onset detector are read from safeMaster's analyser each frame.
// ─────────────────────────────────────────────────────────────────────────────

import type { SafeMaster } from "../_shared/visionary/safeMaster";
import type { FieldDrive } from "./schlierenField";

export class AudioEngine {
  private ctx: AudioContext;
  private safe: SafeMaster;
  private buffer: AudioBuffer;
  private source: AudioBufferSourceNode | null = null;
  private freq: Uint8Array<ArrayBuffer>;
  private time: Uint8Array<ArrayBuffer>;
  private started = false;

  // envelope followers + onset state
  private lowEnv = 0;
  private midEnv = 0;
  private highEnv = 0;
  private rmsEnv = 0;
  private fluxPrev = 0;
  private onsetEnv = 0;

  /** Fires when playback reaches the end (so the UI can reset). */
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext, safe: SafeMaster, buffer: AudioBuffer) {
    this.ctx = ctx;
    this.safe = safe;
    this.buffer = buffer;
    const bins = safe.analyser.frequencyBinCount;
    this.freq = new Uint8Array(new ArrayBuffer(bins));
    this.time = new Uint8Array(new ArrayBuffer(safe.analyser.fftSize));
  }

  /** Begin looping playback of his take through the safe master bus. */
  start(): void {
    if (this.started) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.safe.input);
    src.onended = () => {
      if (this.onEnded) this.onEnded();
    };
    src.start();
    this.source = src;
    this.started = true;
  }

  /** Stop and fully disconnect the source node. */
  stop(): void {
    const src = this.source;
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.source = null;
    this.started = false;
  }

  /**
   * Read the analyser and derive a smoothed FieldDrive. Bin ranges are computed
   * from the actual sample rate; the master's 14 kHz cap means nothing musical
   * lives above the high band. All outputs are roughly 0..1.
   */
  read(): FieldDrive {
    const an = this.safe.analyser;
    an.getByteFrequencyData(this.freq);
    an.getByteTimeDomainData(this.time);

    const nyquist = this.ctx.sampleRate / 2;
    const bins = this.freq.length;
    const hzToBin = (hz: number) =>
      Math.max(0, Math.min(bins - 1, Math.round((hz / nyquist) * bins)));

    const band = (loHz: number, hiHz: number) => {
      const lo = hzToBin(loHz);
      const hi = Math.max(lo + 1, hzToBin(hiHz));
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += this.freq[i];
      return sum / (hi - lo) / 255; // 0..1
    };

    const low = band(30, 250);
    const mid = band(250, 1800);
    const high = band(1800, 7000);

    // RMS from the time-domain waveform
    let acc = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = (this.time[i] - 128) / 128;
      acc += v * v;
    }
    const rms = Math.sqrt(acc / this.time.length);

    // spectral-flux onset: positive change in total spectral energy
    let total = 0;
    for (let i = 0; i < bins; i++) total += this.freq[i];
    total /= bins * 255;
    const flux = Math.max(0, total - this.fluxPrev);
    this.fluxPrev = total;

    // envelope smoothing (attack fast, release slow) for a plume-like settle
    const follow = (env: number, x: number, atk: number, rel: number) =>
      x > env ? env + (x - env) * atk : env + (x - env) * rel;

    this.lowEnv = follow(this.lowEnv, low, 0.5, 0.06);
    this.midEnv = follow(this.midEnv, mid, 0.5, 0.07);
    this.highEnv = follow(this.highEnv, high, 0.55, 0.08);
    this.rmsEnv = follow(this.rmsEnv, rms, 0.5, 0.05);

    const onsetRaw = Math.min(1, flux * 14);
    this.onsetEnv = follow(this.onsetEnv, onsetRaw, 0.8, 0.12);

    return {
      low: this.lowEnv,
      mid: this.midEnv,
      high: this.highEnv,
      rms: this.rmsEnv,
      onset: this.onsetEnv,
    };
  }
}
