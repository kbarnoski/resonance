// ─────────────────────────────────────────────────────────────────────────────
// 4904-criticality — mic.ts
//
// The driver: the user's OWN voice, analysed with a real Web Audio AnalyserNode.
// It exposes a single 0..1 "drive" = loudness (RMS) blended with a low-frequency
// energy proxy standing in for the alpha-band collapse the DMT paper measures.
// (Cortical alpha lives at ~8–12 Hz, inaudible; here the analogue is the low,
// sustained voiced energy of the voice — steady phonation pushes the control
// parameter toward and past criticality; silence lets it fall back.)
//
// Input only. The mic is never routed to the destination — no feedback.
// ─────────────────────────────────────────────────────────────────────────────

export interface MicReadout {
  /** Broadband loudness 0..1. */
  rms: number;
  /** Low-band ("alpha-analogue") energy 0..1. */
  low: number;
}

export class MicDriver {
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer> | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> | null = null;
  private sampleRate = 48000;

  private smRms = 0;
  private smLow = 0;

  /** Open the mic and wire an analyser onto the shared AudioContext.
   *  Must be called from a user gesture. Returns false if denied/unavailable. */
  async start(ctx: AudioContext): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;
      this.sampleRate = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser); // NOT connected to destination — no feedback.

      this.source = source;
      this.analyser = analyser;
      this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  /** Sample the analyser and return the current voice drive (0..1). */
  getDrive(): number {
    const r = this.readout();
    // Loudness dominates; sustained low-band energy adds the extra push that
    // carries the field across the critical point.
    const raw = r.rms * 2.3 + r.low * 1.15;
    return Math.max(0, Math.min(1, raw));
  }

  /** Raw smoothed readouts (for the on-screen meters). */
  readout(): MicReadout {
    const analyser = this.analyser;
    const timeBuf = this.timeBuf;
    const freqBuf = this.freqBuf;
    if (!analyser || !timeBuf || !freqBuf) return { rms: this.smRms, low: this.smLow };

    analyser.getFloatTimeDomainData(timeBuf);
    let sumSq = 0;
    for (let i = 0; i < timeBuf.length; i++) sumSq += timeBuf[i] * timeBuf[i];
    const rms = Math.sqrt(sumSq / timeBuf.length);

    analyser.getByteFrequencyData(freqBuf);
    const binHz = this.sampleRate / analyser.fftSize;
    // Low voiced band ~80–350 Hz — the fundamental region of speech/song.
    const lo = Math.max(1, Math.floor(80 / binHz));
    const hi = Math.min(freqBuf.length, Math.ceil(350 / binHz));
    let sum = 0;
    for (let b = lo; b < hi; b++) sum += freqBuf[b];
    const low = hi > lo ? sum / ((hi - lo) * 255) : 0;

    // Gentle smoothing so meters don't jitter (core does the real dynamics).
    this.smRms += (Math.min(1, rms * 4) - this.smRms) * 0.25;
    this.smLow += (low - this.smLow) * 0.25;
    return { rms: this.smRms, low: this.smLow };
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.source?.disconnect();
    } catch {
      /* already gone */
    }
    this.source = null;
    this.analyser = null;
    this.timeBuf = null;
    this.freqBuf = null;
  }
}
