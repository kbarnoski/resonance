// ─────────────────────────────────────────────────────────────────────────────
// 14704 · Choir Glass — engine module (pure, no React, no DOM audio graph).
//
// Three concerns live here so page.tsx stays about wiring + SVG:
//   1. VOICE PITCH  — autocorrelation pitch detection → a sung pitch-class.
//   2. CONSONANCE   — how well a sung pitch-class fits a pane's active chord.
//   3. GEOMETRY     — the radial rose-window petal paths + full-chromatic hues.
//
// The mic is CONTROL ONLY. Nothing in here ever touches an output node; these
// are math helpers over a Float32Array the caller pulls from a mic AnalyserNode.
// ─────────────────────────────────────────────────────────────────────────────

export const PANE_COUNT = 16;

// ── 1. voice pitch ───────────────────────────────────────────────────────────

export interface SungPitch {
  /** pitch class 0..11 (C=0). */
  pc: number;
  /** detected fundamental in Hz. */
  freq: number;
  /** 0..1 confidence — loudness × periodicity. */
  clarity: number;
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/** Human-readable name for a pitch class, e.g. 9 → "A". */
export function pitchClassName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

/**
 * Detect the fundamental of a mono time-domain frame via normalized
 * autocorrelation, then fold it to a pitch class. Returns null when the frame
 * is too quiet or too noisy to trust. Tuned for a hummed voice (~70–1000 Hz).
 */
export function detectSungPitch(
  buf: Float32Array,
  sampleRate: number,
): SungPitch | null {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return null; // silence / room noise floor

  // Trim leading/trailing near-silence so the correlation locks onto the tone.
  const thresh = 0.15;
  let start = 0;
  let end = size - 1;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[i]) > thresh) {
      start = i;
      break;
    }
  }
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[size - 1 - i]) > thresh) {
      end = size - 1 - i;
      break;
    }
  }
  const trimmed = buf.subarray(start, end);
  const n = trimmed.length;
  if (n < 128) return null;

  const minLag = Math.floor(sampleRate / 1000); // ceiling ~1000 Hz
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 70)); // floor ~70 Hz

  let bestLag = -1;
  let bestCorr = 0;
  let prevCorr = 0;
  let ascending = false;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += trimmed[i] * trimmed[i + lag];
    corr /= n - lag;
    // Take the first strong local maximum (the true period, not an octave down).
    if (corr > prevCorr) {
      ascending = true;
    } else if (ascending && corr < prevCorr) {
      if (prevCorr > bestCorr) {
        bestCorr = prevCorr;
        bestLag = lag - 1;
      }
      ascending = false;
      if (bestLag > 0 && bestCorr > 0.6 * (rms * rms)) break;
    }
    prevCorr = corr;
  }
  if (bestLag <= 0) return null;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const y1 = correlationAt(trimmed, bestLag - 1);
  const y2 = correlationAt(trimmed, bestLag);
  const y3 = correlationAt(trimmed, bestLag + 1);
  const denom = y1 + y3 - 2 * y2;
  const shift = denom !== 0 ? (0.5 * (y1 - y3)) / denom : 0;
  const period = bestLag + shift;
  const freq = sampleRate / period;
  if (!isFinite(freq) || freq < 65 || freq > 1100) return null;

  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const pc = ((midi % 12) + 12) % 12;
  // Periodicity strength normalized against zero-lag energy → 0..1 clarity.
  const zero = correlationAt(trimmed, 0) || 1;
  const periodicity = Math.max(0, Math.min(1, y2 / zero));
  const loud = Math.max(0, Math.min(1, (rms - 0.008) / 0.14));
  return { pc, freq, clarity: Math.max(loud * 0.6, periodicity * loud) };
}

function correlationAt(buf: Float32Array, lag: number): number {
  if (lag < 0 || lag >= buf.length) return 0;
  const n = buf.length;
  let corr = 0;
  for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
  return corr / Math.max(1, n - lag);
}

// ── 2. consonance ────────────────────────────────────────────────────────────

// Interval → perceived consonance (index = semitone distance in pitch-class
// space, 0..11). Unison / fifth / fourth / thirds / sixths ring; seconds,
// sevenths, the tritone grate. Symmetric because pitch-class distance is.
const INTERVAL_CONSONANCE = [
  1.0, // 0  unison / octave
  0.08, // 1  minor 2nd
  0.34, // 2  major 2nd
  0.72, // 3  minor 3rd
  0.78, // 4  major 3rd
  0.82, // 5  perfect 4th
  0.26, // 6  tritone
  0.92, // 7  perfect 5th
  0.62, // 8  minor 6th
  0.68, // 9  major 6th
  0.3, // 10  minor 7th
  0.14, // 11  major 7th
];

/** Consonance (0..1) of a sung pitch class against a single target pc. */
export function intervalConsonance(sungPc: number, targetPc: number): number {
  const d = (((sungPc - targetPc) % 12) + 12) % 12;
  return INTERVAL_CONSONANCE[d];
}

/**
 * The three (or more) pitch classes a chord sounds: root, third (major/minor),
 * fifth. Used so a sustained hum that fits ANY chord tone lights the pane.
 */
export function chordTones(root: number, minor: boolean): number[] {
  return [root % 12, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12];
}

/**
 * How strongly a sung pitch class consonates with a pane's active chord: the
 * best fit across its chord tones. 1 = a chord tone / octave, ~0 = a semitone
 * clash against every tone.
 */
export function paneConsonance(sungPc: number, tones: number[]): number {
  let best = 0;
  for (const t of tones) best = Math.max(best, intervalConsonance(sungPc, t));
  return best;
}

// ── 3. geometry ──────────────────────────────────────────────────────────────

export const VIEW = 600;
export const CENTER = VIEW / 2;
export const INNER_R = 88;
export const OUTER_R = 274;

/**
 * Full-chromatic stained-glass hue for pane i: the 16 panes evenly span the
 * whole color wheel (hue = i/16), deliberately NOT anchored to warm amber or
 * to a single cool band — a real rose window's whole spectrum.
 */
export function paneHue(i: number): number {
  return (i / PANE_COUNT) * 360;
}

export interface PetalPath {
  /** the filled glass shape. */
  d: string;
  /** centroid of the jewel "eye" for the lit highlight. */
  eye: { x: number; y: number; r: number };
  /** center angle in radians (for pointers / labels). */
  angle: number;
}

/** Precompute the Gothic-lancet path + jewel for every petal, once. */
export function buildPetals(): PetalPath[] {
  const petals: PetalPath[] = [];
  const step = (Math.PI * 2) / PANE_COUNT;
  const half = step * 0.43; // gap leaves room for the dark "came" lead lines
  for (let i = 0; i < PANE_COUNT; i++) {
    const a = -Math.PI / 2 + i * step; // pane 0 points up
    const aL = a - half;
    const aR = a + half;
    const mid = (INNER_R + OUTER_R) / 2;

    const innerL = polar(INNER_R, aL);
    const innerR = polar(INNER_R, aR);
    const apex = polar(OUTER_R, a);
    const ctrlL = polar(mid * 1.05, aL);
    const ctrlR = polar(mid * 1.05, aR);
    const baseCtrl = polar(INNER_R * 0.94, a);

    const d =
      `M ${pt(innerL)} ` +
      `Q ${pt(ctrlL)} ${pt(apex)} ` +
      `Q ${pt(ctrlR)} ${pt(innerR)} ` +
      `Q ${pt(baseCtrl)} ${pt(innerL)} Z`;

    const eyeCenter = polar(mid * 1.02, a);
    petals.push({
      d,
      eye: { x: eyeCenter.x, y: eyeCenter.y, r: 15 },
      angle: a,
    });
  }
  return petals;
}

function polar(r: number, ang: number): { x: number; y: number } {
  return { x: CENTER + r * Math.cos(ang), y: CENTER + r * Math.sin(ang) };
}

function pt(p: { x: number; y: number }): string {
  return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
}

/**
 * Glass fill for a pane at a given lit level (0..1). Hue is fixed per pane; the
 * level opens up lightness + opacity so a dim pane is deep near-black glass and
 * a lit one glows saturated.
 */
export function glassFill(hue: number, level: number): string {
  const light = 10 + level * 52; // 10% → 62%
  const sat = 58 + level * 30;
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

/** Lead-line stroke color — near-black cames, tinted a touch by the hue. */
export function leadStroke(hue: number): string {
  return `hsl(${hue.toFixed(0)} 40% 5%)`;
}
