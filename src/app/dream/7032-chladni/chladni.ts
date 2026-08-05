// ─────────────────────────────────────────────────────────────────────────────
// 7032-chladni · chladni.ts — the PLATE PHYSICS, in one place.
//
//   A square Chladni plate of side L supports standing-wave modes
//
//       Z(x,y) = Σ_k  w_k · sin(m_k·π·x/L) · sin(n_k·π·y/W)
//
//   with x,y normalized to the unit square. Sand migrates AWAY from the
//   antinodes (|Z| large, the plate shakes hardest) toward the NODAL LINES
//   where Z ≈ 0 and the surface is still — so grains draw the figure |Z| = 0.
//
//   As the exciting frequency rises, higher (m,n) modes resonate and the
//   figure gets more intricate. We map an incoming frequency to a mode by
//   walking a table of (m,n) pairs sorted by their modal frequency
//   √(m²+n²) — exactly the sequence a real plate climbs as you sweep it.
//
//   THE BIDIRECTIONAL TWIST: once the sand has settled onto the nodal lines,
//   the emergent geometry is read back into sound. `modesToPartials` turns the
//   active modes' spatial-frequency ratios into a just-intonation additive
//   drone, so the plate re-sonifies its own figure — a canvas that is also an
//   instrument. After ChladniSonify (arXiv 2605.09846, 2026).
// ─────────────────────────────────────────────────────────────────────────────

export interface Mode {
  m: number;
  n: number;
  /** 0..1 relative excitation weight of this mode. */
  w: number;
}

export interface SpectralPeak {
  /** peak frequency in Hz */
  freq: number;
  /** 0..1 normalized magnitude */
  mag: number;
}

export interface Partial {
  freq: number;
  gain: number;
}

/** Sweep range, in Hz — the classic Chladni exciter band. */
export const FREQ_MIN = 50;
export const FREQ_MAX = 2000;

/** Highest half-wave count per axis the plate resolves. */
const MAX_MN = 7;

interface TableEntry {
  m: number;
  n: number;
  /** modal-frequency proxy √(m²+n²) (membrane ordering; fine for the demo). */
  f: number;
}

/** All (m,n) with m,n ∈ [1,MAX_MN], sorted by modal frequency √(m²+n²). */
function buildModeTable(): TableEntry[] {
  const t: TableEntry[] = [];
  for (let m = 1; m <= MAX_MN; m++) {
    for (let n = 1; n <= MAX_MN; n++) {
      t.push({ m, n, f: Math.sqrt(m * m + n * n) });
    }
  }
  t.sort((a, b) => a.f - b.f);
  return t;
}

const MODE_TABLE = buildModeTable();
const LOG_MIN = Math.log(FREQ_MIN);
const LOG_MAX = Math.log(FREQ_MAX);

/** Map an exciting frequency (Hz) to an index in the mode table. Higher
 *  frequency → higher (m,n): the plate climbs its mode sequence. Log-scaled
 *  so the audible sweep spreads across the whole table evenly. */
function freqToIndex(freq: number): number {
  const f = Math.min(FREQ_MAX, Math.max(FREQ_MIN, freq));
  const t = (Math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.round(t * (MODE_TABLE.length - 1));
}

/** The single dominant (m,n) a lone frequency would drive — used for readout
 *  and as the spine of the sweep demo. */
export function freqToMode(freq: number): { m: number; n: number } {
  const e = MODE_TABLE[freqToIndex(freq)];
  return { m: e.m, n: e.n };
}

/**
 * Turn the loudest spectral peaks into a superposition of plate modes.
 * The strongest peak seeds the dominant figure plus its two table neighbours
 * (so a single tone still blooms a rich 2-D figure that morphs smoothly as it
 * slides); further peaks stack their own modes, so a chord blooms several
 * overlaid figures at once. Weights come straight from the audio magnitudes.
 */
export function pickModes(peaks: SpectralPeak[], max = 6): Mode[] {
  const acc = new Map<string, Mode>();
  const add = (m: number, n: number, w: number) => {
    if (w <= 0) return;
    const key = `${m}:${n}`;
    const prev = acc.get(key);
    if (prev) prev.w += w;
    else acc.set(key, { m, n, w });
  };

  peaks.forEach((p, i) => {
    const idx = freqToIndex(p.freq);
    const e = MODE_TABLE[idx];
    add(e.m, e.n, p.mag);
    if (i === 0) {
      // Enrich the dominant peak with adjacent modes for a living 2-D figure.
      const lo = MODE_TABLE[Math.max(0, idx - 1)];
      const hi = MODE_TABLE[Math.min(MODE_TABLE.length - 1, idx + 1)];
      add(lo.m, lo.n, p.mag * 0.5);
      add(hi.m, hi.n, p.mag * 0.5);
    }
  });

  const modes = [...acc.values()].sort((a, b) => b.w - a.w).slice(0, max);
  const peak = modes.reduce((mx, md) => Math.max(mx, md.w), 0);
  if (peak > 0) for (const md of modes) md.w /= peak;
  return modes;
}

/** Fallback figure when there is no audio yet: a calm (2,3)/(3,2) pair. */
export function defaultModes(): Mode[] {
  return [
    { m: 2, n: 3, w: 1 },
    { m: 3, n: 2, w: 0.7 },
  ];
}

// ── geometry → sound (re-sonification) ──────────────────────────────────────

const DRONE_BASE = 110; // A2 — warm root for the re-sonified drone
// Octave-reduced just-intonation ratios to snap partials onto → consonant.
const JI = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 5 / 3, 15 / 8, 2];

function foldToOctaveSpan(r: number): number {
  let x = r;
  while (x >= 2) x /= 2;
  while (x < 1) x *= 2;
  return x;
}

function snapJI(r: number): number {
  const folded = foldToOctaveSpan(r);
  let best = JI[0];
  let bd = Infinity;
  for (const j of JI) {
    const d = Math.abs(j - folded);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

/**
 * Re-sonify the emergent geometry: each active mode's spatial frequency
 * √(m²+n²), taken relative to the lowest active mode and snapped to a
 * just-intonation ratio, becomes a sine partial over DRONE_BASE. Higher modes
 * ring an octave up so intricate figures shimmer brighter. Gain follows the
 * mode weight — the plate sings the chord its sand just drew.
 */
export function modesToPartials(modes: Mode[]): Partial[] {
  if (modes.length === 0) return [];
  const fref = Math.min(...modes.map((md) => Math.sqrt(md.m * md.m + md.n * md.n)));
  return modes.map((md) => {
    const fmn = Math.sqrt(md.m * md.m + md.n * md.n);
    const ratio = snapJI(fmn / fref);
    // Intricate (high-order) modes lift an octave so the drone brightens.
    const octave = fmn > fref * 2.2 ? 2 : 1;
    return { freq: DRONE_BASE * ratio * octave, gain: 0.5 * md.w };
  });
}

/** Pack modes into a flat Float32 [m,n,w, …] plus a normalization factor for
 *  the shader (so |Z| lands in ~[0,1] regardless of how many modes stack). */
export function packModes(modes: Mode[]): { data: Float32Array; count: number; norm: number } {
  const count = Math.min(modes.length, 8);
  const data = new Float32Array(8 * 3);
  let wsum = 0;
  for (let i = 0; i < count; i++) {
    data[i * 3 + 0] = modes[i].m;
    data[i * 3 + 1] = modes[i].n;
    data[i * 3 + 2] = modes[i].w;
    wsum += modes[i].w;
  }
  return { data, count, norm: wsum > 0 ? 1 / wsum : 1 };
}
