// ─────────────────────────────────────────────────────────────────────────────
// 1418-beat-field — THE FIELD KERNEL (single source of truth).
//
// Every render tier (WebGPU compute, WebGL2 fragment, Canvas2D grid) AND the
// audio engine draw their numbers from THIS file. The one physical law here is
// the Plomp–Levelt / Sethares sensory-roughness curve between two partials:
//
//     s  = 0.24 / (0.021 * min(f1,f2) + 19)
//     df = |f1 - f2|
//     r  = a1 * a2 * ( exp(-3.5 * s * df) - exp(-5.75 * s * df) )
//
// The instrument is a stack of 4 detunable "voices" (a chord). Each voice emits
// 6 partials. A single scalar BEAT-RATE control `bt` (Hz) splits every voice's
// partials: partial h of a voice at fundamental f sits at  h*f ± h*bt/2, with
// the sign alternating per voice. Because the split scales with h, the UPPER
// partials roughen FIRST as bt grows — you can watch (and hear) the roughness
// climb down the harmonic ladder. Roughness/beating is the PLAYED medium: push
// bt up into the howl, release it back to the lock (silence-of-beating).
//
// The field grid maps 2D screen position → (which voice-pair on y, which partial
// region on x), so the picture literally shows WHERE the roughness lives.
//
// Refs: Plomp & Levelt (1965) "Tonal Consonance and Critical Bandwidth", JASA
// 38; W. Sethares, "Tuning, Timbre, Spectrum, Scale" (2005); XenRoll v0.4.3
// (June 2026) beating dissonance submodel.
// ─────────────────────────────────────────────────────────────────────────────

export const VOICES = 4;
export const PARTIALS = 6; // partials (harmonics) per voice
export const BT_MIN = 0.25; // Hz — the "lock" (silence-of-beating) end
export const BT_MAX = 42; // Hz — the dense-roughness "howl" end
export const MAX_BLOBS = 48; // hard cap so the shader uniform stays small

// Alternating detune direction per voice. Opposite-direction voices are the ones
// whose same-harmonic partials beat against each other at rate ≈ h*bt.
export const VOICE_DIRS: readonly number[] = [1, -1, 1, -1];

// Visual pulsation is clamped WELL below any photosensitive band. The AUDIO beat
// may be fast; the picture must never flicker faster than this.
export const VISUAL_MAX_HZ = 2.8;

// Tunables worth a browser pass (see README).
export const ROUGHNESS_GAIN = 5.0; // total-roughness → 0..1 intensity
export const RADIUS_GAIN = 6.0; // per-blob roughness → blob size

export interface ChordPreset {
  name: string;
  /** Frequency ratios (relative to root) for the 4 voices. */
  ratios: [number, number, number, number];
  blurb: string;
}

// Keys 1–5. Preset 1 is the purest lock↔howl demo (a doubled unison whose ONLY
// beating comes from the bt split); preset 5 is inherently rough even at rest.
export const CHORD_PRESETS: ChordPreset[] = [
  { name: "Unison lock", ratios: [1, 1, 1, 1], blurb: "one pitch, doubled — beating comes purely from the split" },
  { name: "Octave", ratios: [1, 1, 2, 2], blurb: "root + octave, each doubled" },
  { name: "Just fifth", ratios: [1, 1, 1.5, 1.5], blurb: "a pure 3:2 fifth, doubled" },
  { name: "Major triad", ratios: [1, 1.25, 1.5, 2], blurb: "4:5:6 triad over an octave" },
  { name: "Cluster (howl)", ratios: [1, 1.0595, 1.0905, 1.1225], blurb: "a semitone cluster — rough at any bt" },
];

export interface FieldState {
  root: number; // root fundamental (Hz)
  bt: number; // beat-rate control (Hz), BT_MIN..BT_MAX
  drive: number; // 0..1 brightness / loudness from pointer y
  presetIndex: number; // 0..4
}

export interface Partial {
  freq: number;
  amp: number;
  voice: number;
  dir: number;
  h: number;
}

export interface Blob {
  x: number; // 0..1 screen u
  y: number; // 0..1 screen v
  r: number; // raw Plomp–Levelt roughness of the pair
  shimmerHz: number; // visual pulsation rate (≤ VISUAL_MAX_HZ)
}

export interface FieldSnapshot {
  partials: Partial[];
  blobs: Blob[];
  totalRoughness: number; // sum of pairwise r across ALL partials
  intensity: number; // 0..1 normalized (ROUGHNESS_GAIN * totalRoughness)
  activePairs: number; // how many pair-blobs are meaningfully lit
}

export interface RenderFrame {
  blobs: Blob[];
  intensity: number;
  drive: number;
  reduced: boolean;
}

export interface FieldRenderer {
  readonly tier: "webgpu" | "webgl2" | "canvas";
  render(frame: RenderFrame, timeSec: number): void;
  resize(): void;
  dispose(): void;
}

/** Plomp–Levelt / Sethares sensory roughness between two partials. */
export function roughnessPair(f1: number, a1: number, f2: number, a2: number): number {
  const s = 0.24 / (0.021 * Math.min(f1, f2) + 19);
  const df = Math.abs(f1 - f2);
  return a1 * a2 * (Math.exp(-3.5 * s * df) - Math.exp(-5.75 * s * df));
}

/** Log-map pointer x (0..1) → bt (Hz). */
export function btFromX(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return BT_MIN * Math.pow(BT_MAX / BT_MIN, t);
}

/** Inverse of btFromX: bt (Hz) → x (0..1), for driving the pointer indicator. */
export function xFromBt(bt: number): number {
  const b = Math.min(BT_MAX, Math.max(BT_MIN, bt));
  return Math.log(b / BT_MIN) / Math.log(BT_MAX / BT_MIN);
}

/** Which of the 6 unordered voice pairs (vi<vj) → row index 0..5. */
function pairRow(vi: number, vj: number): number {
  const a = Math.min(vi, vj);
  const b = Math.max(vi, vj);
  // (0,1)=0 (0,2)=1 (0,3)=2 (1,2)=3 (1,3)=4 (2,3)=5
  let row = 0;
  for (let i = 0; i < a; i++) row += VOICES - 1 - i;
  return row + (b - a - 1);
}
const PAIR_ROWS = (VOICES * (VOICES - 1)) / 2;

/** Build the full partial list for the current state (used by field + audio). */
export function buildPartials(state: FieldState): Partial[] {
  const preset = CHORD_PRESETS[state.presetIndex] ?? CHORD_PRESETS[0];
  const out: Partial[] = [];
  for (let v = 0; v < VOICES; v++) {
    const fv = state.root * preset.ratios[v];
    const dir = VOICE_DIRS[v];
    for (let h = 1; h <= PARTIALS; h++) {
      const freq = h * fv + dir * ((h * state.bt) / 2);
      out.push({ freq, amp: 1 / h, voice: v, dir, h });
    }
  }
  return out;
}

/** Map a frequency to a normalized x (harmonic region: low left → high right). */
function logNormFreq(freq: number, root: number): number {
  const lo = Math.log(Math.max(1, root * 0.9));
  const hi = Math.log(root * PARTIALS * 1.25);
  const t = (Math.log(Math.max(1, freq)) - lo) / (hi - lo);
  return 0.06 + 0.88 * Math.min(1, Math.max(0, t));
}

/**
 * Compute the roughness field for the current state. Sums pairwise roughness for
 * the intensity/audio drive, and emits the strongest cross-voice pairs as glow
 * blobs positioned by (voice-pair → y, mean-frequency → x).
 */
export function computeField(state: FieldState): FieldSnapshot {
  const partials = buildPartials(state);
  const n = partials.length;

  let total = 0;
  const candidates: Blob[] = [];

  for (let i = 0; i < n; i++) {
    const pi = partials[i];
    for (let j = i + 1; j < n; j++) {
      const pj = partials[j];
      const r = roughnessPair(pi.freq, pi.amp, pj.freq, pj.amp);
      if (r <= 1e-6) continue;
      total += r;
      // Only cross-voice pairs become blobs (within-voice harmonics are far
      // apart, so they carry ~no roughness anyway). Keep the near-harmonic
      // interference where the beating actually lives.
      if (pi.voice === pj.voice) continue;
      if (Math.abs(pi.h - pj.h) > 1) continue;
      const meanF = 0.5 * (pi.freq + pj.freq);
      const row = pairRow(pi.voice, pj.voice);
      const jitter = ((pi.h - 0.5) / PARTIALS - 0.5) * 0.11;
      const y = (row + 0.5) / PAIR_ROWS + jitter;
      candidates.push({
        x: logNormFreq(meanF, state.root),
        y: Math.min(0.96, Math.max(0.04, y)),
        r,
        shimmerHz: Math.min(VISUAL_MAX_HZ, Math.abs(pi.freq - pj.freq)),
      });
    }
  }

  // Keep the strongest blobs (roughest interference reads first).
  candidates.sort((a, b) => b.r - a.r);
  const blobs = candidates.slice(0, MAX_BLOBS);
  const activePairs = candidates.filter((b) => b.r > 0.004).length;

  return {
    partials,
    blobs,
    totalRoughness: total,
    intensity: Math.min(1, total * ROUGHNESS_GAIN),
    activePairs,
  };
}

/**
 * Evaluate the field brightness at a normalized point (used directly by the
 * Canvas2D tier; the GPU tiers mirror this same Gaussian-splat sum in WGSL/GLSL).
 */
export function sampleFieldAt(blobs: Blob[], ux: number, uy: number, timeSec: number): number {
  let val = 0;
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const sigma = 0.03 + 0.05 * Math.min(1, b.r * RADIUS_GAIN);
    const dx = ux - b.x;
    const dy = uy - b.y;
    const d2 = dx * dx + dy * dy;
    const shimmer = 0.6 + 0.4 * Math.sin(6.28318530718 * b.shimmerHz * timeSec);
    val += b.r * shimmer * Math.exp(-d2 / (2 * sigma * sigma));
  }
  return val;
}
