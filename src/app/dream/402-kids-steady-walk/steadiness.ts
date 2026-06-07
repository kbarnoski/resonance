// steadiness.ts — IOI ring buffer + tempo/steadiness estimation
// ──────────────────────────────────────────────────────────────
// Keeps the last N inter-onset intervals (IOIs).
// Exports:
//   tempo      = 1000 / median(IOIs) in BPM
//   steadiness = 1 − clamp(CV, 0, 1)   where CV = stddev / mean

const RING_SIZE = 8; // how many recent IOIs to keep

export interface SteadinessState {
  tempo: number;       // BPM; 0 if < 2 onsets
  steadiness: number;  // 0..1; 1 = perfectly steady
  iois: number[];      // recent inter-onset intervals (ms)
}

export interface SteadinessTracker {
  addOnset: (timeMs: number) => void;
  getState: () => SteadinessState;
  reset: () => void;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  const variance =
    arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function createSteadinessTracker(): SteadinessTracker {
  const iois: number[] = [];
  let lastOnsetMs = -1;

  return {
    addOnset(timeMs: number) {
      if (lastOnsetMs >= 0) {
        const ioi = timeMs - lastOnsetMs;
        // ignore IOIs that are clearly too short (< 200 ms = 300 BPM) or too long
        if (ioi >= 200 && ioi <= 3000) {
          iois.push(ioi);
          if (iois.length > RING_SIZE) iois.shift();
        }
      }
      lastOnsetMs = timeMs;
    },
    getState(): SteadinessState {
      if (iois.length < 2) {
        return { tempo: 0, steadiness: 0, iois: [...iois] };
      }
      const med = median(iois);
      const mean = iois.reduce((s, v) => s + v, 0) / iois.length;
      const sd = stddev(iois, mean);
      const cv = mean > 0 ? sd / mean : 1;
      const steadiness = 1 - Math.min(1, cv);
      const tempo = med > 0 ? 60000 / med : 0;
      return { tempo, steadiness, iois: [...iois] };
    },
    reset() {
      iois.length = 0;
      lastOnsetMs = -1;
    },
  };
}
