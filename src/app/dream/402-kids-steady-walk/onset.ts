// onset.ts — acoustic onset detector for 402-kids-steady-walk
// ─────────────────────────────────────────────────────────────
// Detects hand-claps and percussive voice via spectral-flux × HFC.
// Per-frame: read FFT magnitudes, sum POSITIVE bin-to-bin increases
// (half-wave rectified spectral flux), weight high-frequency bins,
// compare to an adaptive running-mean threshold, debounce with a
// refractory window of ~120 ms (recommended per Repp 2005 for
// synchronisation tap studies).

export interface Onset {
  timeMs: number;
  strength: number;
}

interface OnsetConfig {
  fftSize: number;
  analyserSmoothing: number;
  meanFollow: number;
  thresholdMult: number;
  thresholdFloor: number;
  refractoryMs: number;
  hfcBand: number;
}

const DEFAULT: OnsetConfig = {
  fftSize: 1024,
  analyserSmoothing: 0.0,
  meanFollow: 0.06,
  thresholdMult: 1.8,
  thresholdFloor: 0.05,
  refractoryMs: 120,
  hfcBand: 0.5,
};

export interface OnsetDetector {
  connect: (analyser: AnalyserNode) => void;
  sampleMic: (nowMs: number) => Onset | null;
  inject: (nowMs: number, strength: number) => Onset | null;
  level: () => number;
  threshold: () => number;
  reset: () => void;
  dispose: () => void;
}

export function createOnsetDetector(cfg: OnsetConfig = DEFAULT): OnsetDetector {
  let analyser: AnalyserNode | null = null;
  let bins = 0;
  let spec = new Float32Array(0);
  let prev = new Float32Array(0);
  let dbBuf = new Float32Array(0);

  let mean = 0;
  let peak = 1e-4;
  let lastNovelty = 0;
  let lastThresh = 0;
  let lastOnsetMs = -1e9;

  function computeNovelty(): number {
    if (!analyser) return 0;
    analyser.getFloatFrequencyData(dbBuf);
    const n = bins;
    const hfcStart = Math.floor(n * (1 - cfg.hfcBand));
    let flux = 0;
    for (let k = 0; k < n; k++) {
      const lin = Math.pow(10, dbBuf[k] / 20);
      const diff = lin - (prev[k] ?? 0);
      if (diff > 0) {
        const w = k >= hfcStart ? 2.0 : 1.0;
        flux += diff * w;
      }
      spec[k] = lin;
    }
    // copy spec → prev
    prev.set(spec);
    // normalise by slow peak
    peak = Math.max(peak, flux);
    if (flux < peak * 0.0001) peak *= 0.9999;
    return flux / peak;
  }

  function testThreshold(novelty: number, nowMs: number): Onset | null {
    mean = mean + cfg.meanFollow * (novelty - mean);
    const thresh = mean * cfg.thresholdMult + cfg.thresholdFloor;
    lastNovelty = novelty;
    lastThresh = thresh;
    if (nowMs - lastOnsetMs < cfg.refractoryMs) return null;
    if (novelty > thresh) {
      lastOnsetMs = nowMs;
      return { timeMs: nowMs, strength: Math.min(1, novelty / thresh) };
    }
    return null;
  }

  return {
    connect(a: AnalyserNode) {
      a.fftSize = cfg.fftSize;
      a.smoothingTimeConstant = cfg.analyserSmoothing;
      analyser = a;
      bins = a.frequencyBinCount;
      spec = new Float32Array(bins);
      prev = new Float32Array(bins);
      dbBuf = new Float32Array(bins);
    },
    sampleMic(nowMs: number): Onset | null {
      if (!analyser) return null;
      const nov = computeNovelty();
      return testThreshold(nov, nowMs);
    },
    inject(nowMs: number, strength: number): Onset | null {
      if (nowMs - lastOnsetMs < cfg.refractoryMs) return null;
      lastOnsetMs = nowMs;
      return { timeMs: nowMs, strength: Math.min(1, strength) };
    },
    level: () => lastNovelty,
    threshold: () => lastThresh,
    reset() {
      mean = 0;
      peak = 1e-4;
      lastOnsetMs = -1e9;
    },
    dispose() {
      analyser = null;
    },
  };
}
