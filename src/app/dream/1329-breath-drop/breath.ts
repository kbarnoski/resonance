// ════════════════════════════════════════════════════════════════════════════
// 1329-breath-drop / breath.ts — the microphone as a REAL instrument.
//
// The lab's mic has been passive-gain-only. Here it is the control surface: a
// sustained rising hum CHARGES the tension T, and a sharp loud exhale/vocal
// transient RELEASES the drop. This module owns the mic graph and turns each
// frame into { level, pitch, flux, onset }.
//
//   • level  — RMS loudness (drives the charge rate; steadier/louder = faster).
//   • pitch  — spectral centroid of the detection band (a *rising* hum climbs
//              the hue and the drone cutoff).
//   • flux   — spectral flux (sum of positive bin-magnitude increases).
//   • onset  — flux above an ADAPTIVE threshold (mean + 2.5σ of recent flux),
//              with a refractory gap — this is the exhale that fires the drop.
//
// MIC-FEEDBACK CONTROL: a highpass (~90 Hz) removes rumble/DC from the detection
// band, browser DSP (AGC/NS/echo-cancel) is disabled for a raw signal, the
// analyser is NEVER connected to the destination, the onset threshold is
// adaptive (so it rides room noise), and the UI prompts for headphones.
// ════════════════════════════════════════════════════════════════════════════

const FFT = 2048;
const HP_HZ = 90; // high-pass the detection band (feedback / rumble control)
const DET_LO = 90; // detection band low (Hz)
const DET_HI = 5000; // detection band high (Hz)
const PITCH_LO = 90; // centroid band for the hum
const PITCH_HI = 1200;
const FLUX_HIST = 60; // ~1s at 60fps
const FLUX_K = 2.5; // adaptive threshold = mean + K*std
const REFRACTORY_MS = 220;

export interface BreathFrame {
  /** RMS loudness 0..1. */
  level: number;
  /** Spectral centroid (Hz) of the detection band. */
  pitchHz: number;
  /** Centroid mapped to 0..1 over [PITCH_LO, PITCH_HI]. */
  pitchNorm: number;
  /** Spectral flux this frame. */
  flux: number;
  /** Current adaptive onset threshold. */
  threshold: number;
  /** True when a sharp transient (exhale/vocal hit) fired this frame. */
  onset: boolean;
}

export class BreathInput {
  private ctx: AudioContext;
  private stream: MediaStream;
  private analyser: AnalyserNode;
  private freq: Float32Array;
  private time: Float32Array;
  private prevMag: Float32Array;
  private fluxHist: number[] = [];
  private lastOnsetMs = 0;
  private binHz: number;
  private disposed = false;

  private constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx;
    this.stream = stream;

    const source = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = HP_HZ;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(hp);
    hp.connect(analyser);
    // NEVER connected to ctx.destination — no feedback loop.

    this.analyser = analyser;
    this.binHz = ctx.sampleRate / FFT;
    this.freq = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    this.time = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.prevMag = new Float32Array(analyser.frequencyBinCount);
  }

  /** Open the mic (from a user gesture). Rejects if denied/unavailable. */
  static async open(ctx: AudioContext): Promise<BreathInput> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    return new BreathInput(ctx, stream);
  }

  /** Read + analyse the current frame. Call once per rAF. */
  update(): BreathFrame {
    const a = this.analyser;
    a.getFloatFrequencyData(this.freq as unknown as Float32Array<ArrayBuffer>);
    a.getFloatTimeDomainData(this.time as unknown as Float32Array<ArrayBuffer>);

    // RMS loudness from the time domain
    let sumSq = 0;
    for (let i = 0; i < this.time.length; i++) sumSq += this.time[i] * this.time[i];
    const rms = Math.sqrt(sumSq / this.time.length);
    // map ~[-, ] into a usable 0..1 (raw mic RMS is small)
    const level = Math.min(1, rms * 6);

    const loBin = Math.max(1, Math.floor(DET_LO / this.binHz));
    const hiBin = Math.min(this.freq.length, Math.ceil(DET_HI / this.binHz));
    const pLoBin = Math.max(1, Math.floor(PITCH_LO / this.binHz));
    const pHiBin = Math.min(this.freq.length, Math.ceil(PITCH_HI / this.binHz));

    // spectral flux + centroid
    let flux = 0;
    let weightedFreq = 0;
    let totalMag = 0;
    for (let b = loBin; b < hiBin; b++) {
      const mag = Math.pow(10, this.freq[b] / 20); // dB -> linear
      const d = mag - this.prevMag[b];
      if (d > 0) flux += d;
      this.prevMag[b] = mag;
      if (b >= pLoBin && b < pHiBin) {
        weightedFreq += b * this.binHz * mag;
        totalMag += mag;
      }
    }
    const pitchHz = totalMag > 1e-9 ? weightedFreq / totalMag : 0;
    const pitchNorm = Math.min(
      1,
      Math.max(0, (pitchHz - PITCH_LO) / (PITCH_HI - PITCH_LO)),
    );

    // adaptive threshold: mean + K*std of recent flux
    const hist = this.fluxHist;
    const n = hist.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += hist[i];
    mean = n > 0 ? mean / n : 0;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (hist[i] - mean) ** 2;
    const std = n > 0 ? Math.sqrt(variance / n) : 0;
    const threshold = mean + FLUX_K * std + 0.002;

    const nowMs = performance.now();
    let onset = false;
    if (
      n >= 20 &&
      flux > threshold &&
      flux > 0.01 &&
      nowMs - this.lastOnsetMs > REFRACTORY_MS
    ) {
      onset = true;
      this.lastOnsetMs = nowMs;
    }

    hist.push(flux);
    if (hist.length > FLUX_HIST) hist.shift();

    return { level, pitchHz, pitchNorm, flux, threshold, onset };
  }

  /** Disconnect the mic and stop the tracks. Does NOT close the shared ctx. */
  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.analyser.disconnect();
    } catch {
      /* noop */
    }
    this.stream.getTracks().forEach((t) => t.stop());
  }
}
