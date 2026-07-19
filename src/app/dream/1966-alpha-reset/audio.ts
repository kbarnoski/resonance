// ─────────────────────────────────────────────────────────────────────────────
// 1966-alpha-reset / audio.ts
//
// Three integrated audio subsystems behind one class:
//
//   1. SOURCE   — either a dropped/selected audio FILE (decodeAudioData -> looping
//                 AudioBufferSourceNode) or a DETERMINISTIC generative carrier (a
//                 seeded mulberry32 arpeggio of short notes over a soft drone,
//                 scheduled off ctx.currentTime). The carrier self-demos with no
//                 input and its note attacks naturally drive the onset detector.
//   2. ANALYSIS — an AnalyserNode fan-out for FFT band mapping + a spectral-flux
//                 ONSET DETECTOR (adaptive threshold = running mean + k*std over
//                 ~0.7s, rising-edge local peak, ~120 ms refractory).
//   3. ROUTING  — everything -> master gain -> destination, with a fan-out to the
//                 analyser so band + onset analysis sees whatever is playing.
//
// Determinism: no Math.random / Date.now — seeded mulberry32 + ctx.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

export interface Bands {
  bass: number; // 0..1
  mid: number; // 0..1
  high: number; // 0..1
  loud: number; // 0..1
}

export interface AnalyseResult {
  bands: Bands;
  onset: boolean;
  onsetStrength: number; // 0..1, how far the flux popped above threshold
  flux: number;
}

// Deterministic PRNG — same seed every run (AGENT determinism rule).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARRIER_SEED = 0x51f0a3c7; // constant -> reproducible arpeggio
// A-minor pentatonic (semitone offsets), warm and consonant.
const SCALE = [0, 3, 5, 7, 10, 12];
const ROOT_HZ = 220; // A3

export class AudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private analyser: AnalyserNode;
  private freqBytes: Uint8Array<ArrayBuffer>;
  private specPrev: Float32Array; // previous magnitude spectrum
  private fluxHist: number[] = []; // ~0.7 s of flux values for adaptive threshold
  private prevFlux = 0;
  private lastOnsetT = 0;
  private startT = 0;

  // carrier
  private carrierGain: GainNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private schedTimer: ReturnType<typeof setInterval> | null = null;
  private prng: () => number;
  private step = 0;
  private nextNoteT = 0;
  private tempo = 104; // bpm; 8th-note grid
  private carrierMuted = false;

  // file
  private fileGain: GainNode;
  private fileSource: AudioBufferSourceNode | null = null;

  private disposed = false;

  constructor() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // fan-out to analyser (sees carrier + file)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.master.connect(this.analyser);
    this.freqBytes = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.specPrev = new Float32Array(this.analyser.frequencyBinCount);

    this.carrierGain = this.ctx.createGain();
    this.carrierGain.gain.value = 0.9;
    this.carrierGain.connect(this.master);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 520;
    this.droneGain.connect(droneFilter);
    droneFilter.connect(this.carrierGain);

    this.fileGain = this.ctx.createGain();
    this.fileGain.gain.value = 0.0;
    this.fileGain.connect(this.master);

    this.prng = mulberry32(CARRIER_SEED);
  }

  /** Must be called from a user gesture. Resumes ctx and starts the carrier. */
  async start(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.ctx.resume();
    } catch {
      /* ignore — some browsers resume lazily */
    }
    this.startT = this.ctx.currentTime;
    this.nextNoteT = this.ctx.currentTime + 0.08;
    this.startDrone();
    // lookahead scheduler for the arpeggio
    this.schedTimer = setInterval(() => this.scheduleCarrier(), 25);
    // fade the drone in
    this.droneGain.gain.setTargetAtTime(0.09, this.ctx.currentTime, 0.8);
  }

  private startDrone() {
    const base = ROOT_HZ / 2; // A2
    const detunes = [1.0, 1.004, 0.5];
    for (const dt of detunes) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * dt;
      o.connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
    }
  }

  private scheduleCarrier() {
    if (this.disposed || this.carrierMuted) return;
    const stepDur = 60 / this.tempo / 2; // 8th notes
    const lookahead = 0.12;
    while (this.nextNoteT < this.ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextNoteT);
      this.nextNoteT += stepDur;
      this.step += 1;
    }
  }

  // One arpeggio step. Seeded density waxes and wanes so the piece has DENSE
  // passages (coherence held) and SPARSE passages (it dissolves to snow).
  private playStep(step: number, when: number) {
    // slow seeded envelope of activity, in [0.15, 0.9]
    const density =
      0.52 + 0.38 * Math.sin(step * 0.045) * Math.sin(step * 0.011 + 1.3);
    if (this.prng() > Math.max(0.15, density)) return; // a rest

    const deg = SCALE[Math.floor(this.prng() * SCALE.length)];
    const oct = this.prng() < 0.28 ? 12 : this.prng() < 0.15 ? -12 : 0;
    const freq = ROOT_HZ * Math.pow(2, (deg + oct) / 12);

    const osc = this.ctx.createOscillator();
    osc.type = this.prng() < 0.5 ? "triangle" : "sine";
    osc.frequency.value = freq;

    const g = this.ctx.createGain();
    const peak = 0.16 + 0.12 * this.prng();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006); // sharp attack -> flux spike
    g.gain.exponentialRampToValueAtTime(0.0002, when + 0.28);

    osc.connect(g);
    g.connect(this.carrierGain);
    osc.start(when);
    osc.stop(when + 0.32);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  /** Decode + loop an audio file. Mutes the carrier. Throws on decode failure
   *  (caller keeps the carrier running). */
  async loadFile(buf: ArrayBuffer): Promise<void> {
    const audioBuf = await this.ctx.decodeAudioData(buf.slice(0));
    // stop any previous file
    if (this.fileSource) {
      try {
        this.fileSource.stop();
        this.fileSource.disconnect();
      } catch {
        /* ignore */
      }
      this.fileSource = null;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = audioBuf;
    src.loop = true;
    src.connect(this.fileGain);
    src.start();
    this.fileSource = src;

    // crossfade: carrier down, file up
    const now = this.ctx.currentTime;
    this.carrierGain.gain.setTargetAtTime(0.0, now, 0.25);
    this.droneGain.gain.setTargetAtTime(0.0, now, 0.25);
    this.fileGain.gain.setTargetAtTime(0.95, now, 0.25);
    this.carrierMuted = true;
  }

  /** Return to the generative carrier (e.g. after a decode failure UI). */
  useCarrier(): void {
    if (this.fileSource) {
      try {
        this.fileSource.stop();
        this.fileSource.disconnect();
      } catch {
        /* ignore */
      }
      this.fileSource = null;
    }
    const now = this.ctx.currentTime;
    this.fileGain.gain.setTargetAtTime(0.0, now, 0.25);
    this.carrierGain.gain.setTargetAtTime(0.9, now, 0.25);
    this.droneGain.gain.setTargetAtTime(0.09, now, 0.6);
    this.carrierMuted = false;
  }

  // ── analysis: bands + spectral-flux onset ──────────────────────────────────
  analyse(): AnalyseResult {
    const a = this.analyser;
    a.getByteFrequencyData(this.freqBytes);
    const n = this.freqBytes.length;

    // spectral flux = sum of positive bin-to-bin increases (normalized)
    let flux = 0;
    for (let i = 0; i < n; i++) {
      const v = this.freqBytes[i] / 255;
      const d = v - this.specPrev[i];
      if (d > 0) flux += d;
      this.specPrev[i] = v;
    }
    flux /= n;

    // adaptive threshold over a ~0.7 s window (assume ~60 fps -> ~42 frames)
    this.fluxHist.push(flux);
    if (this.fluxHist.length > 42) this.fluxHist.shift();
    let mean = 0;
    for (const f of this.fluxHist) mean += f;
    mean /= this.fluxHist.length;
    let varr = 0;
    for (const f of this.fluxHist) varr += (f - mean) * (f - mean);
    const std = Math.sqrt(varr / this.fluxHist.length);
    const k = 1.6;
    const threshold = mean + k * std + 1e-4;

    // rising-edge local peak above threshold + refractory
    const t = this.ctx.currentTime;
    let onset = false;
    let onsetStrength = 0;
    const refractory = 0.12;
    if (
      flux > threshold &&
      flux > this.prevFlux &&
      t - this.lastOnsetT > refractory &&
      this.fluxHist.length > 8
    ) {
      onset = true;
      this.lastOnsetT = t;
      onsetStrength = Math.min(1, (flux - threshold) / (std * 3 + 1e-4));
    }
    this.prevFlux = flux;

    // ── band mapping ──────────────────────────────────────────────────────
    // bin width ~ sampleRate / fftSize (~21.5 Hz at 44.1k / 2048)
    const avg = (lo: number, hi: number) => {
      let s = 0;
      const a2 = Math.max(1, lo);
      const b2 = Math.min(n - 1, hi);
      for (let i = a2; i <= b2; i++) s += this.freqBytes[i];
      return s / ((b2 - a2 + 1) * 255);
    };
    const bass = avg(1, 8);
    const mid = avg(9, 90);
    const high = avg(91, 380);
    const loud = avg(1, 380);

    return { bands: { bass, mid, high, loud }, onset, onsetStrength, flux };
  }

  dispose(): void {
    this.disposed = true;
    if (this.schedTimer !== null) {
      clearInterval(this.schedTimer);
      this.schedTimer = null;
    }
    for (const o of this.droneOscs) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.droneOscs = [];
    if (this.fileSource) {
      try {
        this.fileSource.stop();
        this.fileSource.disconnect();
      } catch {
        /* ignore */
      }
      this.fileSource = null;
    }
    try {
      this.carrierGain.disconnect();
      this.droneGain.disconnect();
      this.fileGain.disconnect();
      this.analyser.disconnect();
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    try {
      void this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
