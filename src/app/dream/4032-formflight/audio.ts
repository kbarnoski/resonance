// ════════════════════════════════════════════════════════════════════════════
// 4032 — Formflight · audio engine
//
// A self-demoing, evolving drone (shared droneBank) plus a periodic "shimmer"
// layer whose bright, percussive swells push the spectral centroid up and spike
// the spectral flux — so, with zero devices, the audio itself walks the visual
// cortex from dark sustained TUNNELS toward bright melting HONEYCOMB and back.
// An optional mic is summed into the ANALYSIS bus only (never to the speakers,
// so no feedback); if the mic is denied the drone keeps running.
//
// A single AnalyserNode exposes three live features every frame:
//   centroid (brightness) -> position on the form-constant axis
//   flux     (rate of change) -> morph speed + melt (symmetry-loosening)
//   rms      (loudness) -> saturation / gain + flicker depth
//
// Determinism: no Math.random / Date — a seeded mulberry32(0x4032) picks the
// slow-evolution LFO phases; time comes from ctx.currentTime / the analyser.
// ════════════════════════════════════════════════════════════════════════════

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

/** Deterministic PRNG (inlined, per the lab's replay rule — no Math.random). */
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

export interface AudioFeatures {
  /** Spectral centroid, perceptually normalized to [0,1] (brightness). */
  centroid: number;
  /** Spectral flux, normalized to [0,1] (rate of spectral change). */
  flux: number;
  /** RMS loudness, [0,1]. */
  rms: number;
}

interface EvoLFO {
  freq: number;
  phase: number;
  amp: number;
}

export class FormflightAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private bus: GainNode; // everything audible sums here (drone + shimmer)
  private analyser: AnalyserNode;
  private drone: DroneBank;

  // shimmer layer (bright periodic swell -> centroid + flux)
  private shimmerGain: GainNode;
  private shimmerHP: BiquadFilterNode;
  private shimmerOscs: OscillatorNode[] = [];

  // mic (analysis-only)
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;

  // analysis buffers
  private freqBuf: Uint8Array;
  private timeBuf: Uint8Array;
  private prevMag: Float32Array;

  // slow deterministic evolution
  private rng: () => number;
  private driveLFOs: EvoLFO[];
  private shimmerNext = 0;
  private startedAt: number;
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.rng = mulberry32(0x4032);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.bus = ctx.createGain();
    this.bus.gain.value = 1.0;
    this.bus.connect(this.master);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    // Sniff the audible bus (analyser as a dead-end sink — still analyses input).
    this.bus.connect(this.analyser);

    this.freqBuf = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeBuf = new Uint8Array(this.analyser.fftSize);
    this.prevMag = new Float32Array(this.analyser.frequencyBinCount);

    // The evolving just-intonation drone bed (fades itself in).
    this.drone = startDroneBank(ctx, this.bus, {
      root: 55,
      ratios: [1, 3 / 2, 2, 5 / 2, 3, 4],
      cutoffLow: 180,
      cutoffHigh: 3200,
      peakGain: 0.34,
    });

    // Deterministic slow LFOs that walk the drone's drive (=> centroid sweep).
    this.driveLFOs = [
      { freq: 0.017 + this.rng() * 0.01, phase: this.rng() * Math.PI * 2, amp: 0.5 },
      { freq: 0.041 + this.rng() * 0.02, phase: this.rng() * Math.PI * 2, amp: 0.3 },
      { freq: 0.089 + this.rng() * 0.03, phase: this.rng() * Math.PI * 2, amp: 0.2 },
    ];

    // Shimmer layer: a stack of high partials, high-passed, swelled periodically.
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0.0001;
    this.shimmerHP = ctx.createBiquadFilter();
    this.shimmerHP.type = "highpass";
    this.shimmerHP.frequency.value = 900;
    this.shimmerHP.Q.value = 0.6;
    this.shimmerHP.connect(this.shimmerGain);
    this.shimmerGain.connect(this.bus);

    const shimRatios = [4, 5, 6, 8, 10, 12];
    for (let i = 0; i < shimRatios.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.value = 110 * shimRatios[i];
      osc.detune.value = (this.rng() - 0.5) * 14;
      const g = ctx.createGain();
      g.gain.value = 0.5 / shimRatios[i];
      osc.connect(g);
      g.connect(this.shimmerHP);
      osc.start();
      this.shimmerOscs.push(osc);
    }

    this.startedAt = ctx.currentTime;
    this.shimmerNext = ctx.currentTime + 3.0;
  }

  /** Resume the context (must be called from a user gesture). */
  async begin(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Add the mic to the ANALYSIS bus only (analysis, never to speakers). */
  async enableMic(): Promise<void> {
    if (this.micStream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.micStream = stream;
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micGain = this.ctx.createGain();
    this.micGain.gain.value = 2.2;
    this.micSource.connect(this.micGain);
    // Feed the analyser only — NOT the master — so there is no feedback loop.
    this.micGain.connect(this.analyser);
  }

  /** Remove the mic and stop its tracks. Drone keeps running. */
  disableMic(): void {
    if (this.micGain) {
      try {
        this.micGain.disconnect();
      } catch {
        /* already gone */
      }
      this.micGain = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        /* already gone */
      }
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  get micActive(): boolean {
    return this.micStream !== null;
  }

  /** Advance the slow deterministic evolution (call ~each frame). */
  tick(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const t = now - this.startedAt;

    // Sum the drive LFOs -> a slow walk in [0,1], drives filter brightness.
    let d = 0;
    let norm = 0;
    for (const lfo of this.driveLFOs) {
      d += lfo.amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * lfo.freq * t + lfo.phase));
      norm += lfo.amp;
    }
    const drive = norm > 0 ? d / norm : 0.4;
    this.drone.setDrive(0.12 + drive * 0.85);

    // Periodic shimmer swell -> bright, percussive-ish flux events.
    if (now >= this.shimmerNext) {
      const peak = 0.05 + this.rng() * 0.16;
      const attack = 0.04 + this.rng() * 0.08;
      const decay = 0.5 + this.rng() * 1.4;
      const g = this.shimmerGain.gain;
      try {
        g.cancelScheduledValues(now);
        g.setValueAtTime(Math.max(0.0001, g.value), now);
        g.linearRampToValueAtTime(peak, now + attack);
        g.exponentialRampToValueAtTime(0.0001, now + attack + decay);
      } catch {
        /* ctx closing */
      }
      // also nudge the high-pass so the shimmer "opens" differently each time
      this.shimmerHP.frequency.setTargetAtTime(700 + this.rng() * 1600, now, 0.1);
      this.shimmerNext = now + 2.2 + this.rng() * 4.5;
    }
  }

  /** Read the live spectral features. Call inside requestAnimationFrame. */
  read(): AudioFeatures {
    const analyser = this.analyser;
    analyser.getByteFrequencyData(
      this.freqBuf as unknown as Uint8Array<ArrayBuffer>,
    );
    analyser.getByteTimeDomainData(
      this.timeBuf as unknown as Uint8Array<ArrayBuffer>,
    );

    const bins = this.freqBuf.length;
    const nyquist = this.ctx.sampleRate * 0.5;
    const binHz = nyquist / bins;

    // Centroid + flux over the magnitude spectrum.
    let weighted = 0;
    let total = 0;
    let flux = 0;
    for (let i = 0; i < bins; i++) {
      const m = this.freqBuf[i] / 255;
      weighted += i * binHz * m;
      total += m;
      const diff = m - this.prevMag[i];
      if (diff > 0) flux += diff;
      this.prevMag[i] = m;
    }

    // Centroid in Hz -> perceptual [0,1] via a log map (musically meaningful).
    const centroidHz = total > 1e-4 ? weighted / total : 0;
    const cNorm = Math.min(
      1,
      Math.max(0, Math.log2(Math.max(centroidHz, 20) / 60) / Math.log2(6000 / 60)),
    );

    // Flux normalized: divide by bins, then a gentle gain + clamp.
    const fluxNorm = Math.min(1, (flux / bins) * 22);

    // RMS from the time domain (centered on 128).
    let sumSq = 0;
    const tlen = this.timeBuf.length;
    for (let i = 0; i < tlen; i++) {
      const v = (this.timeBuf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.min(1, Math.sqrt(sumSq / tlen) * 3.2);

    return { centroid: cNorm, flux: fluxNorm, rms };
  }

  /** Full teardown: stop everything, close the context. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disableMic();
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    const stopAt = this.ctx.currentTime + 0.05;
    for (const osc of this.shimmerOscs) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    this.shimmerOscs = [];
    // Give the ramps a beat, then close.
    setTimeout(() => {
      void this.ctx.close().catch(() => {});
    }, 250);
  }
}
