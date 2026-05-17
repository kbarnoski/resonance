"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Six perceptual frequency bands.
 *  Picked for music — sub-bass kick weight, bass groove, mids vocals/keys,
 *  highs cymbals/breath. Treated as a perceptual color wheel below. */
export const BAND_RANGES_HZ: ReadonlyArray<[number, number]> = [
  [20, 60],     // sub-bass
  [60, 250],    // bass
  [250, 500],   // low-mid
  [500, 2000],  // mid
  [2000, 4000], // high-mid
  [4000, 20000],// high
];

export interface MicFrame {
  /** Per-band normalized energy 0-1 after smoothing. */
  bands: number[];
  /** Total RMS amplitude 0-1. */
  amplitude: number;
  /** Spectral centroid (Hz) — average pitch of the signal. */
  centroid: number;
  /** True when an onset (transient/percussive hit) was detected this frame. */
  onset: boolean;
  /** Rolling BPM estimate. NaN before enough data. */
  bpm: number;
}

interface UseMicAnalyserOptions {
  /** Smoothing factor for bands (exponential moving average). 0=no smoothing, 1=frozen. */
  smoothing?: number;
  /** Input gain multiplier — useful for quiet rooms or aux line-in. */
  gain?: number;
  /** Onset detection sensitivity. Higher = fewer onsets. */
  onsetThreshold?: number;
}

/** Hook: open the mic, run FFT, expose smoothed per-band energy + onsets + BPM.
 *  Designed for dream prototypes — call `start()` from a user gesture, read
 *  the current frame via `getFrame()` inside requestAnimationFrame. */
export function useMicAnalyser(opts: UseMicAnalyserOptions = {}) {
  const { smoothing = 0.82, gain = 1.5, onsetThreshold = 1.6 } = opts;

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gainValue, setGainValue] = useState(gain);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const freqBufRef = useRef<Float32Array | null>(null);

  const smoothedBandsRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  // Rolling flux history for onset detection.
  const lastFluxRef = useRef(0);
  const fluxHistoryRef = useRef<number[]>([]);
  // Onset timestamps (ms) used for BPM estimation.
  const onsetTimesRef = useRef<number[]>([]);
  const bpmRef = useRef(NaN);
  // Hop-counting for adaptive onset threshold.
  const lastOnsetAtRef = useRef(0);

  const start = useCallback(async () => {
    if (running) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Disable browser DSP — we want raw input. Most music apps want this.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gainValue;
      gainNodeRef.current = gainNode;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;
      // Allocate over an ArrayBuffer explicitly — Float32Array's default
      // constructor signature on lib.dom narrows to ArrayBuffer (not
      // ArrayBufferLike), which keeps getFloatFrequencyData happy in TS 5.
      freqBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.frequencyBinCount * 4)
      );

      source.connect(gainNode);
      gainNode.connect(analyser);
      // Note: NOT connected to ctx.destination — no feedback loop.

      setRunning(true);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone unavailable. Check permissions and reload."
      );
      setRunning(false);
    }
  }, [running, gainValue]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    freqBufRef.current = null;
    setRunning(false);
  }, []);

  // Apply gain changes live.
  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = gainValue;
  }, [gainValue]);

  // Cleanup on unmount.
  useEffect(() => () => stop(), [stop]);

  /** Read the current frame. Call inside requestAnimationFrame.
   *  Returns null if not running. */
  const getFrame = useCallback((): MicFrame | null => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    const buf = freqBufRef.current;
    if (!analyser || !ctx || !buf) return null;

    // TS 5.5+ + recent lib.dom narrows the typed-array param to
     // Float32Array<ArrayBuffer>; our ref's runtime type satisfies it
     // but the structural check trips on ArrayBufferLike. Cast through.
    analyser.getFloatFrequencyData(buf as unknown as Float32Array<ArrayBuffer>);
    const sampleRate = ctx.sampleRate;
    const binHz = sampleRate / analyser.fftSize;

    // Per-band energy: average dB across bins inside the band, normalize.
    const bandsRaw: number[] = [];
    let totalEnergy = 0;
    let weightedFreqSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < BAND_RANGES_HZ.length; i++) {
      const [lo, hi] = BAND_RANGES_HZ[i];
      const loBin = Math.floor(lo / binHz);
      const hiBin = Math.min(buf.length, Math.ceil(hi / binHz));
      let sumDb = 0;
      let count = 0;
      for (let b = loBin; b < hiBin; b++) {
        sumDb += buf[b];
        count += 1;
        // For centroid: weight bin freq by linear magnitude (10^(db/20)).
        const lin = Math.pow(10, buf[b] / 20);
        weightedFreqSum += b * binHz * lin;
        totalWeight += lin;
      }
      const avgDb = count > 0 ? sumDb / count : -100;
      // dB range we care about: roughly -80 to -10. Map to 0..1.
      const norm = Math.max(0, Math.min(1, (avgDb + 80) / 70));
      bandsRaw.push(norm);
      totalEnergy += norm;
    }

    // Exponential moving average to smooth flicker.
    const smoothed = smoothedBandsRef.current;
    for (let i = 0; i < bandsRaw.length; i++) {
      smoothed[i] = smoothed[i] * smoothing + bandsRaw[i] * (1 - smoothing);
    }

    const amplitude = Math.min(1, totalEnergy / bandsRaw.length);
    const centroid = totalWeight > 0 ? weightedFreqSum / totalWeight : 0;

    // Onset detection: spectral flux on the bass+low-mid bands (energy
    // increase from frame to frame). Adaptive threshold by recent average.
    const fluxNow =
      Math.max(0, bandsRaw[0] - smoothed[0] * 0.9) +
      Math.max(0, bandsRaw[1] - smoothed[1] * 0.9);
    const hist = fluxHistoryRef.current;
    hist.push(fluxNow);
    if (hist.length > 43) hist.shift(); // ~700ms at 60fps
    const avgFlux = hist.reduce((a, b) => a + b, 0) / Math.max(1, hist.length);
    const nowMs = performance.now();
    let onset = false;
    if (
      fluxNow > avgFlux * onsetThreshold &&
      fluxNow > 0.05 &&
      nowMs - lastOnsetAtRef.current > 120 // refractory: no double-fires within 120ms
    ) {
      onset = true;
      lastOnsetAtRef.current = nowMs;
      // BPM: maintain a rolling window of inter-onset intervals.
      const onsets = onsetTimesRef.current;
      onsets.push(nowMs);
      if (onsets.length > 24) onsets.shift();
      if (onsets.length >= 8) {
        const intervals: number[] = [];
        for (let i = 1; i < onsets.length; i++) {
          intervals.push(onsets[i] - onsets[i - 1]);
        }
        // Median interval → BPM (more robust than mean).
        intervals.sort((a, b) => a - b);
        const median = intervals[Math.floor(intervals.length / 2)];
        const bpm = 60000 / median;
        // Clamp to musical range.
        if (bpm >= 40 && bpm <= 220) bpmRef.current = bpm;
      }
    }
    lastFluxRef.current = fluxNow;

    return {
      bands: [...smoothed],
      amplitude,
      centroid,
      onset,
      bpm: bpmRef.current,
    };
  }, [smoothing, onsetThreshold]);

  return {
    running,
    error,
    start,
    stop,
    getFrame,
    /** Live-adjust mic gain (0.1 – 4 is a reasonable range). */
    setGain: setGainValue,
    gain: gainValue,
  };
}
