// ── Sympathetic Strings · Audio Engine ────────────────────────────────────
// Karplus-Strong tuned-delay-line sympathetic resonator bank.
// Reference: Electronic Audio Experiments Prismatic Wall (2026), Jaffe-Smith
//            CMJ 1983, sitar tarab sympathetic strings.
//
// Architecture:
//   Mic → AnalyserNode (tap, never to destination) → GainNode (excitation gain)
//       → AudioWorklet (KS resonator bank) → DynamicsCompressor → destination
//
// The worklet runs a bank of delay lines, each tuned to a string frequency.
// Per-string spectral excitation scaling is updated from AnalyserNode data:
// strings whose frequency overlaps the mic spectrum get more excitation.
//
// SAFETY: worklet feedback clamped to [0, 0.999], DynamicsCompressor as limiter,
//         mic is NEVER connected to destination.

import { WORKLET_SOURCE } from "./worklet-source";

// ── String tuning presets ────────────────────────────────────────────────────

// 88 piano-like semitone frequencies from A0 (27.5 Hz) up through C8 (4186 Hz)
// We use a subset of 48 strings spread across the piano range.
function pianoFreqs(count: number): number[] {
  // A0 = 27.5 Hz, each semitone = *2^(1/12)
  const A0 = 27.5;
  const total = 88;
  // Pick evenly spaced notes across the 88-key range
  const step = (total - 1) / (count - 1);
  const freqs: number[] = [];
  for (let i = 0; i < count; i++) {
    const semitone = Math.round(i * step);
    freqs.push(A0 * Math.pow(2, semitone / 12));
  }
  return freqs;
}

function stackedFifthsFreqs(count: number): number[] {
  // Start from C2 (~65 Hz), stack pure fifths (3/2), wrap to octave
  const root = 65.41; // C2
  const freqs: number[] = [];
  let f = root;
  for (let i = 0; i < count; i++) {
    freqs.push(f);
    f *= 3 / 2;
    // Wrap back into ~piano range
    while (f > 4200) f /= 2;
  }
  // Sort ascending
  return freqs.slice().sort((a, b) => a - b);
}

function overtoneFreqs(count: number): number[] {
  // Build a rich overtone series: harmonics of A1 (55 Hz) plus sub-octaves
  // so that we reliably get >= count unique pitches across the piano range.
  const freqs = new Set<number>();

  // Harmonics 1..60 of A0 (27.5 Hz), clamp to piano range
  for (let harm = 1; harm <= 60; harm++) {
    const f = 27.5 * harm;
    if (f >= 27.5 && f <= 4200) freqs.add(Math.round(f * 100) / 100);
  }

  // Also include octave-reduced versions of higher harmonics (octave equivalents)
  for (let harm = 1; harm <= 120; harm++) {
    let f = 27.5 * harm;
    while (f > 4200) f /= 2;
    while (f < 27.5) f *= 2;
    if (f >= 27.5 && f <= 4200) freqs.add(Math.round(f * 100) / 100);
  }

  const sorted = Array.from(freqs).sort((a, b) => a - b);

  if (sorted.length >= count) {
    // Thin to exactly count, spread evenly
    const step = (sorted.length - 1) / (count - 1);
    const lastFreq = sorted[sorted.length - 1] ?? 4186;
    return Array.from(
      { length: count },
      (_, i) => sorted[Math.round(i * step)] ?? lastFreq,
    );
  }

  // If still short (shouldn't happen with 120 harmonics), pad with high Cs
  const fallback = sorted.length > 0 ? (sorted[sorted.length - 1] ?? 440) : 440;
  while (sorted.length < count) {
    sorted.push(Math.min(fallback * 2, 4186));
  }
  return sorted;
}

export type TuningMode = "chromatic" | "fifths" | "overtone";

export const TUNING_MODES: { id: TuningMode; label: string }[] = [
  { id: "chromatic", label: "Chromatic" },
  { id: "fifths", label: "Stacked Fifths" },
  { id: "overtone", label: "Overtone Series" },
];

const STRING_COUNT = 48;

export function buildFreqs(mode: TuningMode): number[] {
  switch (mode) {
    case "chromatic":
      return pianoFreqs(STRING_COUNT);
    case "fifths":
      return stackedFifthsFreqs(STRING_COUNT);
    case "overtone":
      return overtoneFreqs(STRING_COUNT);
    default:
      return pianoFreqs(STRING_COUNT);
  }
}

// ── Feedback constants ──────────────────────────────────────────────────────
export const FEEDBACK_SUSTAIN = 0.997; // pedal down: near-infinite ring
export const FEEDBACK_DAMP = 0.92;    // pedal up: strings decay quickly

// ── Engine class ─────────────────────────────────────────────────────────────
export class SympathyEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private exciteGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private micStream: MediaStream | null = null;

  // Ghost exciter state
  private ghostInterval: ReturnType<typeof setInterval> | null = null;
  private ghostMode = false;

  // Level reporting (worklet → main thread via port.postMessage)
  private onLevels: ((levels: number[]) => void) | null = null;

  // Spectral analysis
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private specUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private currentFreqs: number[] = [];

  isRunning = false;

  setLevelCallback(cb: (levels: number[]) => void) {
    this.onLevels = cb;
  }

  async start(mode: TuningMode): Promise<{ ghostMode: boolean }> {
    if (this.isRunning) return { ghostMode: this.ghostMode };

    // Create AudioContext inside user gesture (iOS requirement)
    this.ctx = new AudioContext({ sampleRate: 44100 });
    await this.ctx.resume();

    // Build master safety chain
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.001;
    this.compressor.release.value = 0.1;
    this.compressor.connect(this.ctx.destination);

    // Load worklet from Blob URL (no separate file needed)
    const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await this.ctx.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    // Build worklet node
    this.workletNode = new AudioWorkletNode(this.ctx, "karplus-strong-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    // Connect worklet → compressor → destination
    this.workletNode.connect(this.compressor);

    // Wire up level messages from worklet
    this.workletNode.port.onmessage = (e) => {
      if (e.data.type === "levels" && this.onLevels) {
        this.onLevels(e.data.levels as number[]);
      }
    };

    // Initialize strings
    const freqs = buildFreqs(mode);
    this.currentFreqs = freqs;
    this.workletNode.port.postMessage({
      type: "init",
      freqs,
      feedback: FEEDBACK_DAMP,
      damping: 0.5,
    });

    this.isRunning = true;

    // Try mic
    let gotMic = false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      gotMic = true;
    } catch {
      // No mic — fall to ghost exciter
    }

    if (gotMic && this.micStream) {
      // Mic → analyser (for spectral excitation) → exciteGain → worklet input
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.7;
      this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

      this.exciteGain = this.ctx.createGain();
      this.exciteGain.gain.value = 0.6;

      // mic → analyser → exciteGain → worklet
      // IMPORTANT: analyser and exciteGain are NOT connected to destination
      this.micSource.connect(this.analyser);
      this.analyser.connect(this.exciteGain);
      this.exciteGain.connect(this.workletNode);

      // Spectral analysis: update per-string excitation scales from FFT
      this.specUpdateInterval = setInterval(() => {
        this.updateExcitationScales();
      }, 80);

      this.ghostMode = false;
    } else {
      // Ghost exciter: periodic soft noise bursts + octave sweeps
      this.startGhostExciter();
      this.ghostMode = true;
    }

    return { ghostMode: this.ghostMode };
  }

  private updateExcitationScales() {
    if (!this.analyser || !this.analyserData || !this.ctx || !this.workletNode) return;
    this.analyser.getByteFrequencyData(this.analyserData);
    const sr = this.ctx.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const binHz = sr / (binCount * 2);

    const freqs = this.currentFreqs;
    const scales: number[] = new Array<number>(freqs.length).fill(0);

    for (let i = 0; i < freqs.length; i++) {
      const freq = freqs[i];
      // Sample FFT bins around this frequency (±half semitone)
      const halfSemitone = freq * (Math.pow(2, 1 / 24) - 1);
      const loIdx = Math.max(0, Math.floor((freq - halfSemitone) / binHz));
      const hiIdx = Math.min(binCount - 1, Math.ceil((freq + halfSemitone) / binHz));
      let sum = 0;
      let cnt = 0;
      for (let b = loIdx; b <= hiIdx; b++) {
        sum += this.analyserData[b];
        cnt++;
      }
      const avg = cnt > 0 ? sum / cnt : 0;
      // Normalize 0-255 → 0-1 with a gentle curve
      scales[i] = Math.pow(avg / 255, 1.5);
    }

    // Send updated excitation scales to worklet
    this.workletNode.port.postMessage({ type: "scales", scales });
  }

  private startGhostExciter() {
    if (!this.workletNode) return;

    let sweepPhase = 0;
    const freqs = this.currentFreqs;

    this.ghostInterval = setInterval(() => {
      if (!this.ctx || !this.workletNode) return;
      // Every ~300ms pluck a quasi-random string
      sweepPhase += 1;
      // Pick strings that form interesting chords: cycle through sets
      const groupSize = 3;
      const startIdx = (sweepPhase * 7) % Math.max(1, freqs.length - groupSize);
      for (let k = 0; k < groupSize; k++) {
        const idx = (startIdx + k * Math.floor(freqs.length / groupSize)) % freqs.length;
        const amp = 0.12 + Math.random() * 0.10;
        this.workletNode.port.postMessage({ type: "pluck", index: idx, amplitude: amp });
      }
    }, 320);
  }

  retune(mode: TuningMode) {
    if (!this.workletNode) return;
    const freqs = buildFreqs(mode);
    this.currentFreqs = freqs;
    this.workletNode.port.postMessage({
      type: "retune",
      freqs,
      feedback: FEEDBACK_DAMP,
      damping: 0.5,
    });
  }

  setSustain(held: boolean) {
    if (!this.workletNode) return;
    const fb = held ? FEEDBACK_SUSTAIN : FEEDBACK_DAMP;
    this.workletNode.port.postMessage({ type: "setFeedback", value: fb });
  }

  pluckString(index: number, amplitude = 0.6) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "pluck", index, amplitude });
  }

  stop() {
    if (this.ghostInterval !== null) {
      clearInterval(this.ghostInterval);
      this.ghostInterval = null;
    }
    if (this.specUpdateInterval !== null) {
      clearInterval(this.specUpdateInterval);
      this.specUpdateInterval = null;
    }

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.exciteGain) {
      this.exciteGain.disconnect();
      this.exciteGain = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.compressor) {
      this.compressor.disconnect();
      this.compressor = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => { /* ignore */ });
      this.ctx = null;
    }
    this.isRunning = false;
    this.onLevels = null;
  }
}
