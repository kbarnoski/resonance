// ─────────────────────────────────────────────────────────────────────────────
// 7800-strikefield · onset.ts
// Offline onset analysis for a dropped audio file. We decode the buffer, run a
// simple spectral-flux-free energy-flux onset detector over short hops, and for
// each detected attack estimate a brightness (via zero-crossing rate) and a
// loudness. Those two numbers become a strike POSITION and FORCE on the plate —
// so the visitor's music "plays the plate": its rhythm becomes the mallet
// schedule, its melodic brightness sweeps the contact point, and therefore its
// timbre morphs exactly as the strike position moves across the mode grid.
//
// No microphone, no live graph — a pure offline pass over the decoded samples,
// which keeps the whole thing deterministic and self-contained.
// ─────────────────────────────────────────────────────────────────────────────

export interface Onset {
  t: number; // seconds from start of file
  force: number; // 0..1 attack strength → strike force
  brightness: number; // 0..1 (zero-crossing rate) → horizontal strike position
}

const WIN = 1024; // analysis window (samples)
const HOP = 512; // hop size (samples)

/** Detect onsets in a decoded mono-mixed buffer. */
export function detectOnsets(buffer: AudioBuffer): Onset[] {
  const sr = buffer.sampleRate;
  // mono mix
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const mix = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mix[i] += d[i] / ch;
  }

  const frames = Math.max(0, Math.floor((n - WIN) / HOP));
  const energy = new Float32Array(frames);
  const zcr = new Float32Array(frames);
  let peakEnergy = 1e-9;

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let e = 0;
    let zc = 0;
    let prev = mix[off];
    for (let i = 1; i < WIN; i++) {
      const s = mix[off + i];
      e += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zc++;
      prev = s;
    }
    e /= WIN;
    energy[f] = e;
    zcr[f] = zc / WIN; // 0..~0.5
    if (e > peakEnergy) peakEnergy = e;
  }

  // energy flux with a local moving average → adaptive threshold
  const onsets: Onset[] = [];
  const AVG = 8; // frames of local history
  let lastOnsetFrame = -100;
  const minGapFrames = Math.floor((0.08 * sr) / HOP); // ≥80 ms between strikes

  for (let f = AVG; f < frames; f++) {
    let avg = 0;
    for (let k = 1; k <= AVG; k++) avg += energy[f - k];
    avg /= AVG;
    const flux = energy[f] - avg;
    const norm = flux / (peakEnergy + 1e-9);
    // rising edge, clearly above local floor, and past the refractory gap
    if (
      norm > 0.06 &&
      energy[f] > energy[f - 1] &&
      f - lastOnsetFrame >= minGapFrames
    ) {
      lastOnsetFrame = f;
      const t = (f * HOP) / sr;
      const force = Math.min(1, Math.max(0.15, Math.sqrt(norm) * 1.6));
      const brightness = Math.min(1, zcr[f] / 0.25); // 0.25 zcr ≈ very bright
      onsets.push({ t, force, brightness });
    }
  }
  return onsets;
}

/**
 * Map an onset to a strike position on the plate.
 *  - brightness → x  (bright attacks strike toward one edge, dark toward the
 *    other) so melodic/timbral contour continuously sweeps the contact point.
 *  - the onset's ordinal phase → y  (a slow vertical drift so repeated notes at
 *    the same brightness don't all land on the identical node line).
 */
export function onsetToStrike(
  o: Onset,
  index: number,
): { sx: number; sy: number; force: number } {
  const sx = 0.12 + brightnessCurve(o.brightness) * 0.76;
  const sy = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(index * 0.7));
  return { sx, sy, force: o.force };
}

function brightnessCurve(b: number): number {
  // gentle S-curve so the mid-brightness bulk spreads across the plate
  return b * b * (3 - 2 * b);
}
