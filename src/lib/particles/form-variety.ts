// ─────────────────────────────────────────────────────────────────────────────
// form-variety.ts — FAMILIES OF DESIGNS per procedural form (Karel 2026-10-09:
// "i figured you would have dozens of unfolding flower designs, endless shapes,
// things that brought diversity, not the same flower and ribbon shapes").
//
// Every appearance of a form outside Snowflake + Ghost draws its own DESIGN:
// petal count, layers, curl, symmetry, arm count, spiral pitch, braid vs fan …
// The values below are the ACTUAL shader parameters (uVarA/B/C in shaders.ts,
// gated by uVarOn) — this file is the single source of truth for what each
// slot means. Changing a uniform is free; no new programs, no new branches
// compiled on show (the variant code lives inside each soul's existing block).
//
// Mastered journeys never get a variant (uVarOn = 0 → original constants).
// ─────────────────────────────────────────────────────────────────────────────
import type { SoulId } from "./souls";

export type Vec4 = [number, number, number, number];

export interface FormVariant {
  soul: SoulId;
  a: Vec4;
  b: Vec4;
  c: Vec4;
  /** blossom only: this appearance unfolds infinitely (layers grow from the centre) */
  unfold: boolean;
  /** human-readable design (also the "looks alike" signature: discrete traits + coarse continuous ones) */
  label: string;
}

/** Seeded PRNG (mulberry32 over an FNV-1a hash of the key). */
export function rngFor(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const lerp = (lo: number, hi: number, r: R) => lo + (hi - lo) * r();
const int = (lo: number, hi: number, r: R) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[], r: R): T => xs[Math.floor(r() * xs.length) % xs.length];
const sign = (r: R) => (r() < 0.5 ? -1 : 1);
/** coarse bucket of a continuous parameter for the signature */
const bucket = (x: number, lo: number, hi: number, n = 3) => Math.max(0, Math.min(n - 1, Math.floor(((x - lo) / (hi - lo)) * n)));
const Z: Vec4 = [0, 0, 0, 0];

type Gen = (r: R) => Omit<FormVariant, "soul">;

/** The design space of each varied form. */
const GENERATORS: Partial<Record<SoulId, Gen>> = {
  // ── flowers ────────────────────────────────────────────────────────────────
  blossom: (r) => {
    const unfold = r() < 0.5;
    const petals = int(3, 13, r);
    const layers = unfold ? 3 : int(2, 5, r);
    const add = pick([0, 0, 1, 1, 2, 3], r);
    const shape = pick([0.35, 0.55, 0.8, 1.2, 1.7, 2.2], r); // round-wide … slender
    const notch = r() < 0.35 ? lerp(0.15, 0.45, r) : 0;
    const curl = r() < 0.45 ? sign(r) * lerp(0.4, 1.6, r) : 0; // pinwheel petals
    const offset = pick([0, 0.5, 0.382, 0.25, 0.618], r); // stacked / alternate / phyllotaxis
    const rate = lerp(0.03, 0.09, r);
    const cup = lerp(0.3, 1.5, r);
    const turn = sign(r) * lerp(0.015, 0.05, r);
    const shapeName = shape < 0.6 ? "round" : shape < 1.0 ? "classic" : shape < 1.5 ? "lanceolate" : "needle";
    return {
      a: [petals, layers, add, shape], b: [curl, offset, rate, cup], c: [notch, turn, 0, 0], unfold,
      label: `blossom ${petals}p×${layers}L+${add} ${shapeName}${notch ? " notched" : ""}${curl ? (curl > 0 ? " curl-cw" : " curl-ccw") : ""} off${offset} cup${bucket(cup, 0.3, 1.5)}${unfold ? " unfolding" : ""}`,
    };
  },
  rose: (r) => {
    const layers = int(2, 4, r);
    const n0 = int(2, 9, r);
    const add = pick([0, 1, 1, 2], r);
    const d = int(1, 4, r);
    const shrink = lerp(0.25, 1.15 / layers, r);
    const spd = lerp(0.04, 0.14, r);
    const off = lerp(0, 1.2, r);
    const tilt = r() < 0.4 ? lerp(0.2, 0.6, r) : 0;
    return { a: [layers, n0, add, d], b: [shrink, spd, off, tilt], c: Z, unfold: false, label: `rose ${n0}/${d}+${add}×${layers}L${tilt ? " tilted" : ""} off${bucket(off, 0, 1.2)}` };
  },
  mandala: (r) => {
    const rings = int(7, 13, r);
    const step = lerp(1.15, 1.6, r) / (rings - 1);
    const amp = lerp(0.6, 1.8, r);
    const h2 = pick([1, 1, 2, 3], r); // integer: the weave closes round the circle
    const rot = lerp(0.03, 0.09, r);
    const spiral = r() < 0.4 ? lerp(0.08, 0.35, r) : 0;
    const dome = r() < 0.35 ? lerp(0.15, 0.4, r) : 0;
    const oneWay = r() < 0.3 ? 1 : 0;
    return { a: [rings, step, amp, h2], b: [rot, spiral, dome, oneWay], c: Z, unfold: false, label: `mandala ${rings}R h${h2} amp${bucket(amp, 0.6, 1.8)}${spiral ? " spiral" : ""}${dome ? " dome" : ""}${oneWay ? " one-way" : ""}` };
  },
  kaleido: (r) => {
    const inner = lerp(0.05, 0.5, r);
    const reach = lerp(1.2, 2.0, r);
    const wave = lerp(0.1, 0.45, r);
    const rf = int(2, 7, r);
    const ra = lerp(0.08, 0.35, r);
    const spd = sign(r) * lerp(0.02, 0.1, r);
    const br = lerp(0.04, 0.14, r);
    const dome = r() < 0.35 ? lerp(0.15, 0.4, r) : 0;
    return { a: [inner, reach, wave, rf], b: [ra, spd, br, dome], c: Z, unfold: false, label: `kaleido ripple${rf} hole${bucket(inner, 0.05, 0.5)} wave${bucket(wave, 0.1, 0.45)}${dome ? " dome" : ""}${spd < 0 ? " ccw" : " cw"}` };
  },
  medallion: (r) => {
    const rings = int(4, 8, r);
    const step = lerp(1.15, 1.5, r) / rings;
    const r0 = lerp(0.12, 0.32, r);
    const spd = lerp(0.02, 0.06, r);
    const lens = lerp(0.5, 1.8, r);
    const dome = r() < 0.35 ? lerp(0.12, 0.35, r) : 0;
    const oneWay = r() < 0.3 ? 1 : 0;
    return { a: [rings, step, r0, spd], b: [lens, dome, oneWay, 0], c: Z, unfold: false, label: `medallion ${rings}R lens${bucket(lens, 0.5, 1.8)}${dome ? " dome" : ""}${oneWay ? " one-way" : ""}` };
  },
  girih: (r) => {
    const star = pick([[12, 5], [10, 3], [8, 3], [9, 4], [12, 7]] as const, r);
    const c = lerp(0.45, 0.8, r);
    const r1 = lerp(0.95, 1.3, r);
    const r2 = lerp(Math.max(1.6, r1 + 0.5), 2.0, r);
    const spd = lerp(0.5, 1.8, r);
    const strap = lerp(1.6, 2.1, r);
    const dome = r() < 0.3 ? lerp(0.1, 0.3, r) : 0;
    return { a: [c, r1, r2, spd], b: [star[0], star[1], strap, dome], c: Z, unfold: false, label: `girih {${star[0]}/${star[1]}} core${bucket(c, 0.45, 0.8)} ring${bucket(r1, 0.95, 1.3)}${dome ? " dome" : ""}` };
  },
  rings: (r) => {
    const curve = pick([0.6, 0.8, 1, 1.3, 1.6], r);
    const lobes = int(2, 6, r);
    const wob = lerp(0.04, 0.14, r);
    const spd = lerp(0.06, 0.2, r);
    const tilt = lerp(0.2, 1.2, r);
    const fan = r() < 0.4 ? lerp(0.08, 0.3, r) : 0; // gyroscope
    const oneWay = r() < 0.3 ? 1 : 0;
    return { a: [curve, lobes, wob, spd], b: [tilt, fan, oneWay, 0], c: Z, unfold: false, label: `rings curve${curve} lobes${lobes} tilt${bucket(tilt, 0.2, 1.2)}${fan ? " gyroscope" : ""}${oneWay ? " one-way" : ""}` };
  },
  // ── spirals, flows ─────────────────────────────────────────────────────────
  vortex: (r) => {
    const arms = int(2, 7, r);
    const hand = sign(r);
    const pitch = hand * lerp(1.2, 3.6, r);
    const spread = lerp(0.5, 1.6, r);
    const halo = lerp(0.75, 0.95, r);
    const spin = hand * lerp(0.12, 0.32, r);
    const bulge = lerp(0.5, 2.2, r);
    const warp = r() < 0.4 ? lerp(0.1, 0.35, r) : 0;
    const ext = lerp(1.25, 1.85, r);
    return { a: [arms, pitch, spread, halo], b: [spin, bulge, warp, ext], c: Z, unfold: false, label: `vortex ${arms}-arm ${hand > 0 ? "R" : "L"} pitch${bucket(Math.abs(pitch), 1.2, 3.6)} spread${bucket(spread, 0.5, 1.6)}${warp ? " warped" : ""}` };
  },
  ribbons: (r) => {
    const n = int(2, 7, r);
    const mode = pick(["loops", "fan", "braid"] as const, r);
    const ph = mode === "fan" ? lerp(0.15, 0.45, r) : lerp(1.2, 3.0, r);
    const fy = int(1, 3, r);
    const w = lerp(0.15, 0.6, r);
    const tw = lerp(3, 16, r);
    const zm = pick([0.5, 1, 1.5, 2], r);
    const braid = mode === "braid" ? lerp(0.12, 0.3, r) : 0;
    const spd = lerp(0.1, 0.3, r);
    return { a: [n, ph, fy, w], b: [tw, zm, braid, spd], c: Z, unfold: false, label: `ribbons ${n}× ${mode} fig${fy}/${zm} width${bucket(w, 0.15, 0.6)} twist${bucket(tw, 3, 16)}` };
  },
  murmuration: (r) => {
    const fx = lerp(0.4, 0.9, r), fy = lerp(0.3, 0.7, r), fz = lerp(0.25, 0.6, r);
    const lag = lerp(2.5, 7, r);
    const sx = lerp(1.0, 2.4, r), sy = lerp(0.15, 0.7, r);
    const flocks = int(1, 3, r);
    const scale = lerp(0.8, 1.4, r);
    return { a: [fx, fy, fz, lag], b: [sx, sy, flocks, scale], c: Z, unfold: false, label: `murmuration ${flocks} flock${flocks > 1 ? "s" : ""} path${bucket(fx, 0.4, 0.9)}${bucket(fz, 0.25, 0.6)} lag${bucket(lag, 2.5, 7)} sheet${bucket(sy, 0.15, 0.7)}` };
  },
  tendrils: (r) => {
    const n = int(3, 11, r);
    const sway = lerp(0.25, 0.75, r);
    const h = lerp(2.6, 4.2, r);
    const sp = lerp(0.35, 0.75, r);
    const f = lerp(2, 5, r);
    const ring = r() < 0.4 ? 1 : 0;
    const spd = lerp(0.15, 0.45, r);
    const helix = r() < 0.4 ? lerp(0.08, 0.22, r) : 0;
    return { a: [n, sway, h, sp], b: [f, ring, spd, helix], c: Z, unfold: false, label: `tendrils ${n}× ${ring ? "ring" : "row"}${helix ? " helix" : ""} sway${bucket(sway, 0.25, 0.75)}` };
  },
  waves: (r) => {
    const k = lerp(0.6, 1.8, r);
    const amp = lerp(0.15, 0.38, r);
    const y = lerp(-0.7, -0.2, r);
    const dir = lerp(0, Math.PI, r);
    const radial = r() < 0.35 ? 1 : 0;
    const f2 = lerp(1.5, 3.5, r);
    const spd = lerp(1.0, 2.0, r);
    const width = lerp(5, 7, r);
    return { a: [k, amp, y, dir], b: [radial, f2, spd, width], c: Z, unfold: false, label: `waves ${radial ? "radial" : `dir${bucket(dir, 0, Math.PI, 4)}`} k${bucket(k, 0.6, 1.8)} amp${bucket(amp, 0.15, 0.38)}` };
  },
  nebula: (r) => {
    const ax: [number, number, number] = [lerp(0.7, 1.2, r), lerp(0.3, 0.8, r), lerp(0.6, 1.1, r)];
    const br = lerp(0.1, 0.26, r);
    const cs = lerp(0.4, 1.0, r);
    const ca = lerp(0.2, 0.55, r);
    const swirl = r() < 0.5 ? lerp(0.6, 2.2, r) : 0;
    const swSpd = sign(r);
    return { a: [ax[0], ax[1], ax[2], br], b: [cs, ca, swirl, swSpd], c: Z, unfold: false, label: `nebula ${bucket(ax[1], 0.3, 0.8)}flat${swirl ? " spiral" : ""} curl${bucket(cs, 0.4, 1.0)}` };
  },
  smoke: (r) => {
    const c = lerp(0.6, 1.3, r), rise = lerp(0.12, 0.35, r), col = lerp(0.4, 0.9, r);
    const swirl = r() < 0.5 ? sign(r) * lerp(0.08, 0.3, r) : 0;
    return { a: [c, rise, col, swirl], b: Z, c: Z, unfold: false, label: `smoke curl${bucket(c, 0.6, 1.3)} col${bucket(col, 0.4, 0.9)}${swirl ? " swirl" : ""}` };
  },
  ink: (r) => {
    const c = lerp(0.7, 1.6, r), amp = lerp(0.25, 0.5, r), sink = lerp(-0.03, 0.1, r);
    return { a: [c, amp, sink, 0], b: Z, c: Z, unfold: false, label: `ink curl${bucket(c, 0.7, 1.6)} amp${bucket(amp, 0.25, 0.5)} sink${bucket(sink, -0.03, 0.1)}` };
  },
  // ── spheres, figures ───────────────────────────────────────────────────────
  harmonics: (r) => {
    const rad = lerp(1.0, 1.3, r), amp = lerp(0.12, 0.34, r), o2 = int(3, 7, r), o3 = int(6, 12, r);
    const spin = sign(r) * lerp(0.05, 0.2, r), squash = lerp(0.6, 1.3, r);
    return { a: [rad, amp, o2, o3], b: [spin, squash, 0, 0], c: Z, unfold: false, label: `harmonics o${o2}/${o3} amp${bucket(amp, 0.12, 0.34)} squash${bucket(squash, 0.6, 1.3)}` };
  },
  lissajous: (r) => {
    const loops = int(2, 4, r), ph = lerp(0, Math.PI * 2, r);
    const sx = lerp(1.2, 2.0, r), sy = lerp(0.8, 1.4, r), sz = lerp(0.8, 1.5, r), spd = lerp(0.1, 0.35, r);
    return { a: [loops, ph, sx, sy], b: [sz, spd, 0, 0], c: Z, unfold: false, label: `lissajous ${loops} loops ph${bucket(ph, 0, Math.PI * 2, 4)} wide${bucket(sx, 1.2, 2.0)}` };
  },
  torus: (r) => {
    const R0 = lerp(0.8, 1.2, r), lobes = int(2, 6, r), depth = r() < 0.6 ? lerp(0.08, 0.3, r) : 0;
    const rot = sign(r) * lerp(0.05, 0.2, r), tilt = lerp(0.5, 1.3, r);
    return { a: [R0, lobes, depth, rot], b: [tilt, 0, 0, 0], c: Z, unfold: false, label: `torus${depth ? ` ${lobes}-lobed` : ""} R${bucket(R0, 0.8, 1.2)} tilt${bucket(tilt, 0.5, 1.3)}` };
  },
};

/** Forms that carry a design family (the rest are stochastic fields). */
export const VARIED_SOULS: readonly SoulId[] = Object.keys(GENERATORS) as SoulId[];

/** One design for one appearance (null for unvaried forms). */
export function formVariant(soul: SoulId, seed: string): FormVariant | null {
  const g = GENERATORS[soul];
  if (!g) return null;
  return { soul, ...g(rngFor(`${soul}|${seed}`)) };
}

/**
 * The next design for an appearance: never one shown recently (`recent` =
 * labels of the loop's last designs, newest first) — re-drawn up to 12 times.
 */
export function freshVariant(soul: SoulId, seed: string, recent: readonly string[]): FormVariant | null {
  let v = formVariant(soul, seed);
  for (let i = 1; v && i < 12 && recent.includes(v.label); i++) v = formVariant(soul, `${seed}#${i}`);
  return v;
}

/** Loop-wide memory of shown designs (labels, newest first). */
export const RECENT_DESIGNS: string[] = [];
export function rememberDesign(label: string, max = 64): void {
  RECENT_DESIGNS.unshift(label);
  if (RECENT_DESIGNS.length > max) RECENT_DESIGNS.length = max;
}
