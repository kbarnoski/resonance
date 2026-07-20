// ── Ambient-microphone onset detector (the cycle-2 input layer) ───────────────
// The ROOM plays the cairn. Real percussive sounds in the room — claps, snaps,
// desk-taps, tongue-clicks, beatbox — are turned into strikes by SPECTRAL-FLUX
// onset detection (Bello et al., "A Tutorial on Onset Detection in Music
// Signals," 2005): each analysis frame we sum the positive bin-to-bin increases
// in magnitude; a transient shows up as a spike above an adaptive threshold
// (running mean + margin·std over a short window). A refractory period keeps one
// clap = one strike. On an accepted onset we read the frame's SPECTRAL CENTROID
// (brightness) to pick the material, and the frame's peak amplitude to set
// velocity. No note, no pitch — just the colour and force of the transient.
//
// This module owns NO timing state of its own beyond the refractory clock; the
// caller passes the AudioContext clock time each frame, so nothing here reads
// Date.now / performance.now.

export interface OnsetResult {
  /** Strike velocity, clamped to the engine's useful range. */
  velocity: number;
  /** Spectral centroid of the onset frame, in Hz (brightness). */
  centroid: number;
  /** Raw flux magnitude of the onset (for debugging / display). */
  flux: number;
}

// Centroid → material thresholds (Hz). Bright, sharp clicks (snaps, tongue
// clicks) land high; dark thuds (desk thumps) land low. Mid sits on wood/ceramic.
const CENTROID_DROPLET = 3400; // > this → droplet (brightest)
const CENTROID_CERAMIC = 2200; // > this → ceramic
const CENTROID_WOOD = 1200; // > this → wood, else → stone

export function materialForCentroid(
  centroid: number,
): "droplet" | "ceramic" | "wood" | "stone" {
  if (centroid >= CENTROID_DROPLET) return "droplet";
  if (centroid >= CENTROID_CERAMIC) return "ceramic";
  if (centroid >= CENTROID_WOOD) return "wood";
  return "stone";
}

export class OnsetDetector {
  private ctx: AudioContext;
  private stream: MediaStream;
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private hp: BiquadFilterNode;

  private bins: number;
  private mag: Float32Array<ArrayBuffer>; // current linear magnitude spectrum
  private prevMag: Float32Array<ArrayBuffer>; // previous frame's magnitude
  private db: Float32Array<ArrayBuffer>; // scratch for getFloatFrequencyData
  private time: Float32Array<ArrayBuffer>; // scratch for getFloatTimeDomainData
  private binHz: number;

  private fluxWindow: number[] = []; // recent flux values (adaptive threshold)
  private readonly windowLen = 43; // ~0.7 s at 60 fps
  private lastOnset = -1; // ctx time of the last accepted onset
  private readonly refractory = 0.1; // seconds — one clap = one strike

  /** User sensitivity, 0.3 (quiet room / loud players) … 2.2 (very sensitive). */
  sensitivity = 1;
  /** Live input level, 0..1, for the on-screen meter (peak-following). */
  level = 0;

  constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx;
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);

    // A gentle high-pass keeps room rumble / DC / HVAC hum out of the flux.
    this.hp = ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.hp.frequency.value = 120;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0; // raw frames → crisp transients

    this.source.connect(this.hp);
    this.hp.connect(this.analyser);
    // NB: not connected to destination → no monitoring / feedback.

    this.bins = this.analyser.frequencyBinCount; // 512
    this.mag = new Float32Array(this.bins);
    this.prevMag = new Float32Array(this.bins);
    this.db = new Float32Array(this.bins);
    this.time = new Float32Array(this.analyser.fftSize);
    this.binHz = ctx.sampleRate / this.analyser.fftSize;
  }

  /** Analyse one frame. Returns an onset if a transient crossed the threshold. */
  detect(nowSec: number): OnsetResult | null {
    const analyser = this.analyser;
    analyser.getFloatFrequencyData(this.db);
    analyser.getFloatTimeDomainData(this.time);

    // peak amplitude for the level meter + strike velocity
    let peak = 0;
    for (let i = 0; i < this.time.length; i++) {
      const a = Math.abs(this.time[i]);
      if (a > peak) peak = a;
    }
    // meter decays smoothly, rises instantly (peak-follower)
    this.level = peak > this.level ? peak : this.level * 0.86 + peak * 0.14;

    // dB → linear magnitude, and spectral flux (positive increases only)
    let flux = 0;
    let centNum = 0;
    let centDen = 0;
    for (let i = 0; i < this.bins; i++) {
      const d = this.db[i];
      const m = d <= -140 ? 0 : Math.pow(10, d / 20);
      this.mag[i] = m;
      const diff = m - this.prevMag[i];
      if (diff > 0) flux += diff;
      const f = i * this.binHz;
      centNum += f * m;
      centDen += m;
    }
    // swap buffers (reuse allocation)
    const tmp = this.prevMag;
    this.prevMag = this.mag;
    this.mag = tmp;

    const centroid = centDen > 1e-9 ? centNum / centDen : 0;

    // adaptive threshold from the recent flux window (mean + margin·std)
    let mean = 0;
    for (const v of this.fluxWindow) mean += v;
    mean = this.fluxWindow.length ? mean / this.fluxWindow.length : 0;
    let varSum = 0;
    for (const v of this.fluxWindow) varSum += (v - mean) * (v - mean);
    const std = this.fluxWindow.length
      ? Math.sqrt(varSum / this.fluxWindow.length)
      : 0;

    // higher sensitivity → lower bar; floor keeps a silent room from firing
    const margin = 2.6 / this.sensitivity;
    const floor = 0.4 / this.sensitivity;
    const threshold = mean + margin * std + floor;

    this.fluxWindow.push(flux);
    if (this.fluxWindow.length > this.windowLen) this.fluxWindow.shift();

    const past = nowSec - this.lastOnset >= this.refractory;
    if (flux > threshold && past && flux > floor) {
      this.lastOnset = nowSec;
      const velocity = Math.max(0.2, Math.min(1, 0.28 + peak * 1.5));
      return { velocity, centroid, flux };
    }
    return null;
  }

  destroy(): void {
    try {
      this.source.disconnect();
      this.hp.disconnect();
      this.analyser.disconnect();
    } catch {
      /* ignore */
    }
    for (const track of this.stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
  }
}
