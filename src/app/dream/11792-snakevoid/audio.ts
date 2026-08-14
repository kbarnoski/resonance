// ─────────────────────────────────────────────────────────────────────────────
// 11792-snakevoid · audio.ts — the self-driving generative ambient bed.
//
//   A slow just-intonation drone (shared startDroneBank) breathes through a vast
//   cistern reverb (shared createVoidReverb), everything tamed by the shared
//   createSafeMaster limiter bus. NEVER ctx.destination.
//
//   The loop is closed the honest way: the visual driver sets the drone's `drive`
//   each frame, so the BED itself swells; we then read the bed's real output
//   spectrum back off the safe-master analyser (getSwell) and hand THAT to the
//   illusion. So the illusory rotation genuinely answers to the sound you hear,
//   not to a number that merely also happens to drive the audio.
//
//   An optional private mic tap (time-domain only, never routed to the output —
//   no feedback) lets room / voice energy push the same swell harder.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { clamp } from "./prng";

type AudioCtor = typeof AudioContext;

export class SnakeAudio {
  readonly ctx: AudioContext;
  private readonly master: SafeMaster;
  private readonly reverb: VoidReverb;
  private readonly drone: DroneBank;
  private readonly freqBuf: Uint8Array;

  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Uint8Array | null = null;

  private swell = 0.15; // smoothed spectral swell fed to the visuals
  private disposed = false;

  constructor() {
    const Ctor: AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = createSafeMaster(this.ctx, { gain: 0.82 });
    this.reverb = createVoidReverb(this.ctx, { seconds: 6, decay: 2.2, wet: 0.5 });
    this.reverb.output.connect(this.master.input);

    // Deep, slow bed — A1 root with a stacked just chord for the INTENSE pole.
    this.drone = startDroneBank(this.ctx, this.reverb.input, {
      root: 55,
      ratios: [1, 3 / 2, 2, 5 / 2, 3],
      cutoffLow: 180,
      cutoffHigh: 2200,
      peakGain: 0.3,
    });
    // A little dry body under the wet tail.
    this.drone.output.connect(this.master.input);

    this.freqBuf = new Uint8Array(new ArrayBuffer(this.master.analyser.frequencyBinCount));
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* some browsers resolve resume() lazily */
      }
    }
  }

  /** Push the current swell into the bed (drive opens the filter + wet tail). */
  setDrive(d: number): void {
    if (this.disposed) return;
    const drive = clamp(d, 0, 1);
    this.drone.setDrive(drive);
    this.reverb.setWet(0.38 + 0.32 * drive);
  }

  /** Read the bed's real output spectrum → a smoothed 0..1 low-mid swell. */
  getSwell(): number {
    if (this.disposed) return this.swell;
    this.master.analyser.getByteFrequencyData(
      this.freqBuf as unknown as Uint8Array<ArrayBuffer>,
    );
    // Low-mid bins carry the drone's body; average them.
    let sum = 0;
    let n = 0;
    for (let b = 2; b < 48; b++) {
      sum += this.freqBuf[b];
      n++;
    }
    const target = n > 0 ? sum / (n * 255) : 0;
    this.swell += (target - this.swell) * 0.06; // slow spectral swell
    return clamp(this.swell, 0, 1);
  }

  /** Open the mic and wire a private time-domain analyser (never to output). */
  async startMic(): Promise<boolean> {
    if (this.disposed || this.micAnalyser) return this.micAnalyser != null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      this.micStream = stream;
      const src = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser); // NOT to destination — no feedback
      this.micAnalyser = analyser;
      this.micBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      return true;
    } catch {
      return false;
    }
  }

  /** Room / voice RMS energy 0..1, or 0 when no mic. */
  getMicEnergy(): number {
    const a = this.micAnalyser;
    const buf = this.micBuf;
    if (!a || !buf) return 0;
    a.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
    let acc = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      acc += v * v;
    }
    return clamp(Math.sqrt(acc / buf.length) * 3.2, 0, 1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.drone.stop();
    } catch {
      /* already stopping */
    }
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micAnalyser?.disconnect();
      this.drone.output.disconnect();
      this.reverb.output.disconnect();
    } catch {
      /* graph gone */
    }
    this.micStream = null;
    this.micAnalyser = null;
    this.micBuf = null;
    this.master.disconnect();
    try {
      void this.ctx.close();
    } catch {
      /* already closing */
    }
  }
}
