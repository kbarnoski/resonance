// audio.ts — the room auralisation engine. ONE audio source (one of Karel's real
// recordings) is injected as a point source into the FDTD field; the listener's
// LOCAL field energy spatialises what you hear. ZERO oscillators, ZERO synthesis
// — every audible sample is Karel's real piano.
//
// Output signal path (the single source):
//   BufferSource(loop) → listenerGain → delay → lowpass → safe.input → speakers
//   (a parallel feedback-delay send off `lowpass` gives the far corners a tail)
//
// A separate `driveAnalyser` taps the source BEFORE listenerGain, so the room is
// always driven by the music even when the listener stands on a silent node.

import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

export interface Drive {
  /** Signed instantaneous waveform peak, ~[-1,1] — the room's source drive. */
  signed: number;
  /** Smoothed loudness (RMS), 0..~1 — for HUD + drive scaling. */
  rms: number;
}

export class RoomAudio {
  private ctx: AudioContext;
  private safe: SafeMaster;

  private listenerGain: GainNode;
  private delay: DelayNode;
  private lowpass: BiquadFilterNode;

  // room tail (feedback delay send)
  private tapGain: GainNode;
  private tailDelay: DelayNode;
  private tailFb: GainNode;
  private tailOut: GainNode;

  // drive tap (pre-listenerGain) — keeps the room excited at nodes too
  private driveAnalyser: AnalyserNode;
  private timeBuf: Uint8Array<ArrayBuffer>;
  private freqBuf: Uint8Array<ArrayBuffer>;
  private prevFreq: Float32Array;

  private source: AudioBufferSourceNode | null = null;
  private disposed = false;
  private rmsSmooth = 0;
  private lastOnset = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.safe = createSafeMaster(ctx, { gain: 0.8 });

    this.listenerGain = ctx.createGain();
    this.listenerGain.gain.value = 0.0001;

    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.0;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 2000;
    this.lowpass.Q.value = 0.7;

    this.listenerGain.connect(this.delay);
    this.delay.connect(this.lowpass);
    this.lowpass.connect(this.safe.input);

    // Gentle feedback-delay reverb tail (roominess in the far corners).
    this.tapGain = ctx.createGain();
    this.tapGain.gain.value = 0.32;
    this.tailDelay = ctx.createDelay(1.0);
    this.tailDelay.delayTime.value = 0.19;
    this.tailFb = ctx.createGain();
    this.tailFb.gain.value = 0.42;
    this.tailOut = ctx.createGain();
    this.tailOut.gain.value = 0.5;
    this.lowpass.connect(this.tapGain);
    this.tapGain.connect(this.tailDelay);
    this.tailDelay.connect(this.tailFb);
    this.tailFb.connect(this.tailDelay); // feedback loop (<1, bounded)
    this.tailDelay.connect(this.tailOut);
    this.tailOut.connect(this.safe.input);

    // Drive tap — pure sink, analyses the raw source.
    this.driveAnalyser = ctx.createAnalyser();
    this.driveAnalyser.fftSize = 1024;
    this.driveAnalyser.smoothingTimeConstant = 0.6;
    this.timeBuf = new Uint8Array(new ArrayBuffer(this.driveAnalyser.fftSize));
    this.freqBuf = new Uint8Array(
      new ArrayBuffer(this.driveAnalyser.frequencyBinCount),
    );
    this.prevFreq = new Float32Array(this.driveAnalyser.frequencyBinCount);
  }

  get analyser(): AnalyserNode {
    return this.safe.analyser;
  }

  /** Load + loop one real recording, replacing any current source. */
  async loadTrack(id: string): Promise<void> {
    const buf = await loadRealTrackBuffer(this.ctx, id);
    if (this.disposed) return;

    // Tear down any previous source first.
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* not started */
      }
      try {
        this.source.disconnect();
      } catch {
        /* gone */
      }
      this.source = null;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf.buffer;
    src.loop = true;
    src.connect(this.listenerGain);
    src.connect(this.driveAnalyser); // tap
    src.start();
    this.source = src;
  }

  /** Sample the raw source: signed waveform peak (source drive) + smoothed RMS. */
  getDrive(): Drive {
    this.driveAnalyser.getByteTimeDomainData(this.timeBuf);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = (this.timeBuf[i] - 128) / 128;
      if (Math.abs(v) > Math.abs(peak)) peak = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeBuf.length);
    this.rmsSmooth = this.rmsSmooth * 0.8 + rms * 0.2;
    return { signed: peak, rms: this.rmsSmooth };
  }

  /** Spectral-flux onset detector → a stronger source splat on note attacks. */
  onset(nowSec: number): boolean {
    this.driveAnalyser.getByteFrequencyData(this.freqBuf);
    let flux = 0;
    for (let i = 0; i < this.freqBuf.length; i++) {
      const v = this.freqBuf[i] / 255;
      const d = v - this.prevFreq[i];
      if (d > 0) flux += d;
      this.prevFreq[i] = v;
    }
    flux /= this.freqBuf.length;
    if (flux > 0.012 && nowSec - this.lastOnset > 0.14) {
      this.lastOnset = nowSec;
      return true;
    }
    return false;
  }

  /**
   * Spatialise the audio for the listener's position:
   *   local field energy → gain   (antinode = loud/open, node = quiet)
   *   distance from source → delay + a lowpass that darkens with distance.
   * All params ramp with setTargetAtTime so movement never clicks.
   */
  setListener(energy: number, distNorm: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;

    const open = smoothstep(0.015, 0.32, energy); // 0..1 node→antinode
    const gain = 0.035 + open * 0.95;
    const delayT = Math.max(0, Math.min(0.12, distNorm * 0.12));
    const inv = 1 - Math.max(0, Math.min(1, distNorm));
    const cutoff = 480 + inv * inv * 6200;

    this.listenerGain.gain.setTargetAtTime(gain, now, 0.09);
    this.delay.delayTime.setTargetAtTime(delayT, now, 0.12);
    this.lowpass.frequency.setTargetAtTime(cutoff, now, 0.12);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.source?.stop();
    } catch {
      /* not started */
    }
    try {
      this.source?.disconnect();
      this.listenerGain.disconnect();
      this.delay.disconnect();
      this.lowpass.disconnect();
      this.tapGain.disconnect();
      this.tailDelay.disconnect();
      this.tailFb.disconnect();
      this.tailOut.disconnect();
      this.driveAnalyser.disconnect();
    } catch {
      /* already torn down */
    }
    this.safe.disconnect();
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
