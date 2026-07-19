// ─────────────────────────────────────────────────────────────────────────────
// 1972-morphosong / audio.ts — the voice: hum in, organism out.
//
//   INPUT  (human-required, non-touch): the MICROPHONE. A hum/sung tone is
//   pitch-tracked by time-domain AUTOCORRELATION (getFloatTimeDomainData, not
//   FFT — more stable for a sustained hum) plus RMS energy. The analyser is a
//   dead-end: the mic is NEVER connected onward, so acoustic feedback is
//   impossible by construction, and the output drone is never routed back in.
//
//   HEADLESS / no-mic: a DETERMINISTIC seeded carrier — pitch & energy as pure
//   functions of an integer frame counter (no Math.random / Date.now / new Date).
//
//   OUTPUT: a bank of INHARMONIC partials over a low root. Their amplitudes are
//   set from the organism's field statistics (mean V, variance, gradient) — so
//   what swells on screen swells in your ears. That coupling is the whole point.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import type { FieldStats } from "./sim";

export interface Voice {
  pitchNorm: number; // 0..1 (log-mapped over the hum range)
  rms: number; // 0..1 vocal energy
  pitchHz: number;
}

const HUM_LO = 85; // Hz — bottom of the tracked hum range
const HUM_HI = 420; // Hz — top of the tracked hum range
const LOG_SPAN = Math.log2(HUM_HI / HUM_LO);

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hzToNorm(hz: number): number {
  if (hz <= 0) return 0;
  return clamp(Math.log2(hz / HUM_LO) / LOG_SPAN, 0, 1);
}
function normToHz(n: number): number {
  return HUM_LO * Math.pow(2, clamp(n, 0, 1) * LOG_SPAN);
}

/** The deterministic seeded carrier: pitch + energy as pure functions of an
 *  integer frame counter. Drives the whole piece with no mic and no randomness,
 *  so the 06:30 headless review is never blank or silent-by-accident. */
export function carrierAt(frame: number): Voice {
  const pitchNorm = 0.5 + 0.5 * Math.sin(frame * 0.0016);
  const rms = 0.46 + 0.26 * (0.5 + 0.5 * Math.sin(frame * 0.0037 + 1.0));
  return { pitchNorm, rms, pitchHz: normToHz(pitchNorm) };
}

// Inharmonic partial ratios (bell/membrane-like) over the low root.
const RATIOS = [1.0, 1.52, 2.03, 2.66, 3.19, 3.86, 4.51];
const BASE_AMP = [1.0, 0.7, 0.62, 0.5, 0.42, 0.34, 0.26];
const ROOT_HZ = 55; // A1 — a fixed low root; morphology re-voices the timbre.
const PER_PARTIAL = 0.085;

export class MorphoVoice {
  readonly ctx: AudioContext;
  private master: GainNode;
  private reverb: VoidReverb;

  private partials: OscillatorNode[] = [];
  private partialGains: GainNode[] = [];

  // the "input hum" made audible in demo mode (in mic mode, you hum acoustically)
  private humOsc: OscillatorNode;
  private humGain: GainNode;

  // mic (analyser is a dead-end — never connected onward)
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer> | null = null;
  private micStream: MediaStream | null = null;

  private mode: "carrier" | "mic" = "carrier";
  private smoothNorm = 0.4;
  private smoothRms = 0.4;
  private minLag = 1;
  private maxLag = 1;
  private disposed = false;

  constructor() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    this.reverb = createVoidReverb(this.ctx, { seconds: 5, decay: 2.4, wet: 0.4 });
    this.master.connect(this.reverb.input);
    this.reverb.output.connect(this.ctx.destination);

    // inharmonic partial bank
    for (let i = 0; i < RATIOS.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = ROOT_HZ * RATIOS[i];
      // a hair of detune per partial → slow organic beating
      osc.detune.value = i * 1.7;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.master);
      this.partials.push(osc);
      this.partialGains.push(g);
    }

    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.0001;
    this.humOsc = this.ctx.createOscillator();
    this.humOsc.type = "triangle";
    this.humOsc.frequency.value = normToHz(this.smoothNorm);
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 900;
    this.humOsc.connect(humFilter);
    humFilter.connect(this.humGain);
    this.humGain.connect(this.master);
  }

  /** Must be called from a user gesture. */
  async start(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.ctx.resume();
    } catch {
      /* some browsers resume lazily */
    }
    const sr = this.ctx.sampleRate;
    this.minLag = Math.max(2, Math.floor(sr / HUM_HI));
    this.maxLag = Math.floor(sr / 60);
    for (const o of this.partials) o.start();
    this.humOsc.start();
    // fade the organism drone up
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.6);
  }

  /** Try to open the microphone. Returns false on denial/absence (caller shows a
   *  note and the seeded carrier keeps running). */
  async enableMic(): Promise<boolean> {
    if (this.disposed) return false;
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== "function") return false;
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      return false;
    }
    this.micStream = stream;
    const src = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser); // DEAD-END: analyser is never connected onward.
    this.analyser = analyser;
    this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.mode = "mic";
    // silence the synthetic input hum — the human supplies it now
    this.humGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    return true;
  }

  get inputMode(): "carrier" | "mic" {
    return this.mode;
  }

  /** Read the current voice. In mic mode: autocorrelation pitch + RMS from the
   *  live hum. In carrier mode: the deterministic seeded carrier (frame-driven),
   *  and the synthetic input hum is voiced so the demo is audibly a hum. */
  analyse(frame: number): Voice {
    if (this.mode === "mic" && this.analyser && this.timeBuf) {
      this.analyser.getFloatTimeDomainData(this.timeBuf);
      const { hz, rms } = this.detectPitch(this.timeBuf);
      // gate: only move pitch when there's a real tone present
      if (hz > 0 && rms > 0.012) {
        this.smoothNorm = lerp(this.smoothNorm, hzToNorm(hz), 0.2);
      }
      this.smoothRms = lerp(this.smoothRms, clamp(rms * 7, 0, 1), 0.25);
      return {
        pitchNorm: this.smoothNorm,
        rms: this.smoothRms,
        pitchHz: normToHz(this.smoothNorm),
      };
    }

    // carrier
    const c = carrierAt(frame);
    this.smoothNorm = lerp(this.smoothNorm, c.pitchNorm, 0.1);
    this.smoothRms = lerp(this.smoothRms, c.rms, 0.1);
    const hz = normToHz(this.smoothNorm);
    if (!this.disposed) {
      const now = this.ctx.currentTime;
      this.humOsc.frequency.setTargetAtTime(hz, now, 0.08);
      this.humGain.gain.setTargetAtTime(0.05 * this.smoothRms, now, 0.15);
    }
    return { pitchNorm: this.smoothNorm, rms: this.smoothRms, pitchHz: hz };
  }

  /** Restricted-lag time-domain autocorrelation over the hum range. */
  private detectPitch(buf: Float32Array): { hz: number; rms: number } {
    const N = Math.min(1024, buf.length);
    let rms = 0;
    for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / N);
    if (rms < 0.008) return { hz: -1, rms };

    let bestLag = -1;
    let bestCorr = 0;
    let prev = 0;
    let rising = false;
    for (let lag = this.minLag; lag <= this.maxLag && lag < N; lag++) {
      let s = 0;
      for (let i = 0; i < N - lag; i++) s += buf[i] * buf[i + lag];
      // first strong peak after the correlation starts rising again
      if (s > prev) rising = true;
      if (rising && s > bestCorr) {
        bestCorr = s;
        bestLag = lag;
      }
      prev = s;
    }
    if (bestLag <= 0) return { hz: -1, rms };
    return { hz: this.ctx.sampleRate / bestLag, rms };
  }

  /** SEE ≈ HEAR: map field statistics onto the inharmonic partial amplitudes. */
  setMorphology(stats: FieldStats): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const level = clamp(stats.meanV * 3.2, 0, 1); // presence → overall loudness
    const bright = clamp(stats.grad * 9, 0, 1); // edges → spectral tilt upward
    const rough = clamp(stats.varV * 12, 0, 1); // spottiness → upper-partial swell

    for (let i = 0; i < this.partialGains.length; i++) {
      const hi = i / (this.partialGains.length - 1); // 0 (root) .. 1 (top)
      // dark morphologies favour the fundamental; bright/edgy ones the highs
      let w = (1 - hi) * (1 - bright) + hi * bright;
      w = 0.18 + 0.82 * w;
      let amp = level * BASE_AMP[i] * w;
      if (i >= 3) amp *= 0.5 + 0.6 * rough;
      this.partialGains[i].gain.setTargetAtTime(
        amp * PER_PARTIAL,
        now,
        0.28,
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const o of this.partials) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* already gone */
      }
    }
    try {
      this.humOsc.stop();
      this.humOsc.disconnect();
    } catch {
      /* already gone */
    }
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      this.micStream = null;
    }
    try {
      this.analyser?.disconnect();
      this.master.disconnect();
      this.reverb.input.disconnect();
      this.reverb.output.disconnect();
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
