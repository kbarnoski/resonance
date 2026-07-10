// ─────────────────────────────────────────────────────────────────────────────
// 1380 · OVERTONE THROAT — Web Audio engine
// A DRONE BANK of 12 sine partials at f0·1 … f0·12. Each partial's gain tracks a
// quiet bed PLUS a boost proportional to how strongly the singer emphasizes that
// overtone in real time — a slow-release follower so an emphasized partial blooms
// and SUSTAINS into a shimmering chord after the voice softens (self-played
// overtone drone). The raw mic is analyser-only (a sink, never routed to output)
// so the loop is feedback-safe. Master → gentle limiter, gain ≤ 0.18, ramp-from-0
// on start and a 1.5 s fade + ctx.close() on stop.
// ─────────────────────────────────────────────────────────────────────────────

import { NUM_HARMONICS, clamp, detectF0 } from "./analysis";

export interface FrameState {
  /** Instantaneous per-harmonic emphasis 0..1 (smoothed). */
  emphasis: number[];
  /** Slow-release follower 0..1 — what actually drives the drone gains + visuals. */
  sustain: number[];
  /** Index (0..11) of the currently dominant OVERTONE (fundamental excluded). */
  dominant: number;
  /** Fundamental frequency the bank is tuned to. */
  f0: number;
  /** Mic input RMS this frame. */
  rms: number;
  /** True when a real mic signal is driving the ladder; false = auto sweep. */
  micActive: boolean;
}

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  base: number;
}

const MASTER_TARGET = 0.18; // ≤ 0.2

export class OvertoneEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private partials: Partial[] = [];
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array | null = null;
  private freqBuf: Float32Array | null = null;
  private stream: MediaStream | null = null;

  private emphasis = new Float32Array(NUM_HARMONICS);
  private sustain = new Float32Array(NUM_HARMONICS);
  private autoPhase = Math.PI / 2;
  private stopped = false;

  f0: number;
  micActive = false;
  rms = 0;

  constructor(f0: number) {
    this.f0 = f0;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Safari prefix
      (window as any).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;

    // Build the drone bank: 12 pure sine partials at f0·1 … f0·12.
    for (let h = 1; h <= NUM_HARMONICS; h++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f0 * h;
      const gain = ctx.createGain();
      // Quiet bed, rolling off toward the top so the bank is warm, not harsh.
      const base = 0.014 * Math.pow(0.82, h - 1);
      gain.gain.value = base;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      this.partials.push({ osc, gain, base });
    }

    // Ramp master up from silence — audible the moment Begin fires.
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(MASTER_TARGET, now + 1.2);
  }

  /** Attach the microphone as an analyser-only sink. Returns false if denied. */
  async enableMic(): Promise<boolean> {
    if (this.analyser) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;
      const src = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 4096; // ~10.7 Hz/bin at 44.1k — resolves low harmonics
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser); // sink only — NOT connected to destination
      this.analyser = analyser;
      this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.freqBuf = new Float32Array(
        new ArrayBuffer(analyser.frequencyBinCount * 4),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Re-tune the whole bank to a new fundamental (note picker / detected pitch). */
  setF0(f0: number) {
    this.f0 = f0;
    const t = this.ctx.currentTime;
    for (let h = 1; h <= NUM_HARMONICS; h++) {
      this.partials[h - 1].osc.frequency.setTargetAtTime(f0 * h, t, 0.05);
    }
  }

  /** On-demand pitch detect from the live mic buffer. Returns Hz or -1. */
  detectPitch(): number {
    if (!this.analyser || !this.timeBuf) return -1;
    this.analyser.getFloatTimeDomainData(
      this.timeBuf as unknown as Float32Array<ArrayBuffer>,
    );
    return detectF0(this.timeBuf, this.ctx.sampleRate);
  }

  /** Advance one frame: extract per-harmonic energy from the mic (or run the
   *  auto sweep), update the sustain follower, drive the drone gains, and return
   *  the frame state for the glyph ladder to render. */
  update(dt: number, reduced: boolean): FrameState {
    const inst = new Float32Array(NUM_HARMONICS);
    let haveMic = false;

    if (this.analyser && this.timeBuf && this.freqBuf) {
      this.analyser.getFloatTimeDomainData(
        this.timeBuf as unknown as Float32Array<ArrayBuffer>,
      );
      let s = 0;
      for (let i = 0; i < this.timeBuf.length; i++) s += this.timeBuf[i] ** 2;
      this.rms = Math.sqrt(s / this.timeBuf.length);

      if (this.rms > 0.006) {
        haveMic = true;
        this.analyser.getFloatFrequencyData(
          this.freqBuf as unknown as Float32Array<ArrayBuffer>,
        );
        const binHz = this.ctx.sampleRate / this.analyser.fftSize;
        // Window: ± ~a third of f0 around each harmonic — captures the partial
        // without leaking into its neighbours (harmonics are f0 apart).
        const w = Math.max(1, (this.f0 * 0.34) / binHz);
        for (let h = 1; h <= NUM_HARMONICS; h++) {
          const center = (this.f0 * h) / binHz;
          const lo = Math.max(0, Math.floor(center - w));
          const hi = Math.min(this.freqBuf.length - 1, Math.ceil(center + w));
          let mx = -140;
          for (let bnd = lo; bnd <= hi; bnd++) {
            if (this.freqBuf[bnd] > mx) mx = this.freqBuf[bnd];
          }
          // dB (~-96 floor .. -30 loud) → 0..1
          inst[h - 1] = clamp((mx + 96) / 66, 0, 1);
        }
      }
    }

    this.micActive = haveMic;

    if (!haveMic) {
      // Auto-drone fallback: a Gaussian bump slowly sweeping up and down the
      // ladder so the piece keeps singing and animating with no mic.
      this.autoPhase += dt * (reduced ? 0.06 : 0.14);
      const center = 5.5 + 4.5 * Math.sin(this.autoPhase);
      const width = 1.5;
      for (let h = 1; h <= NUM_HARMONICS; h++) {
        const d = h - 1 - center;
        inst[h - 1] = Math.exp(-(d * d) / (2 * width * width));
      }
      inst[0] = Math.max(inst[0], 0.5); // hold a fundamental presence
    }

    // Smooth the instantaneous emphasis.
    const eSmooth = reduced ? 0.85 : 0.7;
    for (let h = 0; h < NUM_HARMONICS; h++) {
      this.emphasis[h] = this.emphasis[h] * eSmooth + inst[h] * (1 - eSmooth);
    }

    // Sustain follower: fast attack (~80 ms) so partials bloom, slow release
    // (~1.6 s) so the emphasized overtone HOLDS after the voice softens.
    const relTau = reduced ? 2.4 : 1.6;
    for (let h = 0; h < NUM_HARMONICS; h++) {
      const e = this.emphasis[h];
      const tau = e > this.sustain[h] ? 0.08 : relTau;
      this.sustain[h] += (e - this.sustain[h]) * (1 - Math.exp(-dt / tau));
    }

    // Dominant OVERTONE (exclude the fundamental so the cursor lives up the
    // ladder — the bright partial you're shaping toward).
    let dominant = 1;
    let best = -1;
    for (let h = 1; h < NUM_HARMONICS; h++) {
      if (this.sustain[h] > best) {
        best = this.sustain[h];
        dominant = h;
      }
    }

    // Drive the drone bank: base bed + emphasis boost, gently rolled off.
    const t = this.ctx.currentTime;
    for (let h = 0; h < NUM_HARMONICS; h++) {
      const p = this.partials[h];
      const boost = this.sustain[h] * 0.07 * Math.pow(0.9, h);
      p.gain.gain.setTargetAtTime(p.base + boost, t, 0.06);
    }

    return {
      emphasis: Array.from(this.emphasis),
      sustain: Array.from(this.sustain),
      dominant,
      f0: this.f0,
      rms: this.rms,
      micActive: haveMic,
    };
  }

  /** Fade out over 1.5 s, stop the mic, then close the context. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 1.5);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    window.setTimeout(() => {
      try {
        this.partials.forEach((p) => p.osc.stop());
      } catch {
        /* already stopped */
      }
      void this.ctx.close();
    }, 1600);
  }
}
