// ─────────────────────────────────────────────────────────────────────────
// 2-D affect-field → bilinear chord-quality morph engine
// ─────────────────────────────────────────────────────────────────────────
// The sun's normalized position (fx, fy) in [0..1] bilinearly blends FOUR
// chord "feelings" at the corners of a Russell-circumplex feelings-sky:
//
//   up-left  (fx 0, fy 0)  bright MAJOR        happy   (Hevner: major≈happy)
//   down-left(fx 0, fy 1)  MINOR              cozy    (Hevner: minor≈wistful)
//   down-right(fx 1, fy 1) SUS2/SUS4          floaty  (Hevner: suspended≈floating)
//   up-right (fx 1, fy 0)  ADD9 / MAJ7        dreamy  (Hevner: maj7/add9≈dreamy)
//
// A fixed root drone + steady perfect-fifth are ALWAYS present (always in
// tune). Two "color voices" glide continuously:
//   • the harmonic THIRD morphs between maj3 / min3 / P4(sus)
//   • a high ADDED-TONE voice that fades in toward the dreamy corner
// All changes are continuous so the harmony morphs click-free.

export type Feeling = {
  /** semitone offset (from root) of the morphing "third" color voice */
  thirdSemi: number;
  /** semitone offset of the high added-tone color voice */
  addSemi: number;
  /** 0..1 gain of the high added-tone voice (fades in toward dreamy) */
  addLevel: number;
  /** 0..1 weights of each corner feeling, for visuals */
  w: { happy: number; cozy: number; floaty: number; dreamy: number };
};

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Root note (MIDI) of the always-on drone — C3, warm + low, kid-safe. */
export const ROOT_MIDI = 48;

// Corner third-intervals (semitones above root):
//   happy major3 = 4, cozy minor3 = 3, floaty P4(sus) = 5, dreamy major3 = 4
const THIRD = { happy: 4, cozy: 3, floaty: 5, dreamy: 4 };
// Corner added-tone intervals (an octave-ish up): happy octave(12),
// cozy m7-ish(10), floaty 9th(14), dreamy maj7/9 shimmer(11/14 avg → 13)
const ADD = { happy: 12, cozy: 10, floaty: 14, dreamy: 13 };
// How present the high added voice is at each corner (dreamy/floaty bloom):
const ADDLVL = { happy: 0.18, cozy: 0.1, floaty: 0.5, dreamy: 0.9 };

/** Bilinear corner weights for normalized (fx, fy), each in [0..1]. */
export function cornerWeights(fx: number, fy: number) {
  const x = clamp01(fx);
  const y = clamp01(fy);
  return {
    happy: (1 - x) * (1 - y), // up-left
    cozy: (1 - x) * y, // down-left
    dreamy: x * (1 - y), // up-right
    floaty: x * y, // down-right
  };
}

/** Compute the continuously-morphing harmony for a sun position. */
export function computeFeeling(fx: number, fy: number): Feeling {
  const w = cornerWeights(fx, fy);
  const thirdSemi =
    THIRD.happy * w.happy +
    THIRD.cozy * w.cozy +
    THIRD.floaty * w.floaty +
    THIRD.dreamy * w.dreamy;
  const addSemi =
    ADD.happy * w.happy +
    ADD.cozy * w.cozy +
    ADD.floaty * w.floaty +
    ADD.dreamy * w.dreamy;
  const addLevel =
    ADDLVL.happy * w.happy +
    ADDLVL.cozy * w.cozy +
    ADDLVL.floaty * w.floaty +
    ADDLVL.dreamy * w.dreamy;
  return { thirdSemi, addSemi, addLevel, w };
}

// ── Color / visual palette (shifts with feeling) ────────────────────────────

type RGB = [number, number, number];

const SKY_TOP: Record<keyof Feeling["w"], RGB> = {
  happy: [255, 196, 92], // warm gold
  cozy: [74, 64, 138], // deep blue/lavender
  floaty: [56, 150, 150], // teal mist
  dreamy: [196, 120, 200], // pink-violet shimmer
};
const SKY_BOTTOM: Record<keyof Feeling["w"], RGB> = {
  happy: [255, 138, 92],
  cozy: [38, 30, 78],
  floaty: [26, 78, 96],
  dreamy: [108, 60, 150],
};
const SUN_GLOW: Record<keyof Feeling["w"], RGB> = {
  happy: [255, 226, 130],
  cozy: [180, 170, 255],
  floaty: [150, 245, 230],
  dreamy: [255, 180, 245],
};

function blendRgb(map: Record<keyof Feeling["w"], RGB>, w: Feeling["w"]): RGB {
  const r =
    map.happy[0] * w.happy +
    map.cozy[0] * w.cozy +
    map.floaty[0] * w.floaty +
    map.dreamy[0] * w.dreamy;
  const g =
    map.happy[1] * w.happy +
    map.cozy[1] * w.cozy +
    map.floaty[1] * w.floaty +
    map.dreamy[1] * w.dreamy;
  const b =
    map.happy[2] * w.happy +
    map.cozy[2] * w.cozy +
    map.floaty[2] * w.floaty +
    map.dreamy[2] * w.dreamy;
  return [Math.round(r), Math.round(g), Math.round(b)];
}

export function rgbStr([r, g, b]: RGB, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export type Palette = {
  skyTop: string;
  skyBottom: string;
  glow: RGB;
  glowStr: string;
};

export function palette(w: Feeling["w"]): Palette {
  const glow = blendRgb(SUN_GLOW, w);
  return {
    skyTop: rgbStr(blendRgb(SKY_TOP, w)),
    skyBottom: rgbStr(blendRgb(SKY_BOTTOM, w)),
    glow,
    glowStr: rgbStr(glow),
  };
}
