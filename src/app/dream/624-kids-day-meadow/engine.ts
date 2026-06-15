// engine.ts — the musical & temporal spine of "A Whole Day".
//
// Two ideas live here:
//
// 1) A continuous DIURNAL PHASE in [0,1) (0 = deep dawn) that crosses through
//    ~5 musical regions. Region weights cross-fade so there is never a hard
//    cut — at any instant we have a blended scale, tempo, brightness and a sky
//    palette. The phase also drives the visuals (sun/moon arc, stars, tint).
//
// 2) A MOTIF-MEMORY BANK ("anchor" idea, after arXiv 2604.05343 Anchored
//    Cyclic Generation): every planted thing stores a tiny motif as abstract
//    scale-degrees + a rhythm. At play time motifs are RE-VOICED into the
//    CURRENT region's scale, so accumulated material keeps fitting as harmony
//    evolves, and motifs slowly MUTATE across phases (transpose / ornament /
//    thin). That memory is what makes minute 8 differ from minute 1 while
//    still cohering.

export type Kind = "flower" | "bird" | "star";

// Region indices along the day.
export const REGIONS = ["dawn", "morning", "midday", "dusk", "night"] as const;
export type RegionName = (typeof REGIONS)[number];

// Each region: a scale expressed as semitone offsets from a root, the root
// (MIDI), a tempo (beats/sec for the ostinato), an overall brightness 0..1,
// and a 3-stop sky gradient [top, mid, bottom] as [r,g,b].
interface Region {
  scale: number[]; // semitone degrees within an octave-ish span
  rootMidi: number;
  bps: number; // ostinato beats per second
  brightness: number;
  sky: [number, number, number][]; // top, mid, bottom
  cloud: [number, number, number];
}

const REGION_DATA: Record<RegionName, Region> = {
  // dawn — major pentatonic / lydian shimmer, deep-indigo -> rose, slow
  dawn: {
    scale: [0, 2, 4, 7, 9, 12, 14, 16, 19],
    rootMidi: 57, // A
    bps: 1.1,
    brightness: 0.32,
    sky: [
      [24, 22, 58],
      [86, 64, 110],
      [214, 138, 138],
    ],
    cloud: [220, 170, 180],
  },
  // morning — bright major, livelier, clear-blue
  morning: {
    scale: [0, 2, 4, 5, 7, 9, 11, 12, 16, 19],
    rootMidi: 60, // C
    bps: 1.7,
    brightness: 0.7,
    sky: [
      [86, 150, 222],
      [150, 196, 240],
      [214, 232, 248],
    ],
    cloud: [255, 255, 255],
  },
  // midday — fullest, playful major, brightest
  midday: {
    scale: [0, 2, 4, 7, 9, 11, 12, 14, 16, 19, 21],
    rootMidi: 62, // D
    bps: 2.0,
    brightness: 1.0,
    sky: [
      [96, 170, 236],
      [168, 214, 246],
      [226, 244, 252],
    ],
    cloud: [255, 255, 255],
  },
  // dusk — warm mixolydian / suspended, amber -> violet, slowing
  dusk: {
    scale: [0, 2, 4, 5, 7, 9, 10, 12, 14, 17],
    rootMidi: 59, // B
    bps: 1.3,
    brightness: 0.5,
    sky: [
      [70, 48, 96],
      [186, 96, 96],
      [240, 170, 96],
    ],
    cloud: [232, 150, 120],
  },
  // night — low glassy lullaby pentatonic + drone, near-black, slowest
  night: {
    scale: [0, 3, 5, 7, 10, 12, 15, 17],
    rootMidi: 50, // D (low)
    bps: 0.85,
    brightness: 0.12,
    sky: [
      [6, 8, 26],
      [16, 20, 48],
      [30, 34, 66],
    ],
    cloud: [40, 48, 86],
  },
};

// Centers of each region along phase [0,1). Evenly placed; cross-fade between.
const REGION_CENTERS: Record<RegionName, number> = {
  dawn: 0.0,
  morning: 0.2,
  midday: 0.42,
  dusk: 0.64,
  night: 0.84,
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Smooth circular weight for a region center given current phase.
function regionWeight(phase: number, center: number): number {
  // circular distance in [0,0.5]
  let d = Math.abs(phase - center);
  if (d > 0.5) d = 1 - d;
  // a soft bump ~0.22 wide
  const w = Math.max(0, 1 - d / 0.26);
  return w * w * (3 - 2 * w); // smoothstep
}

export interface DayState {
  phase: number; // 0..1
  brightness: number; // blended 0..1
  bps: number; // blended ostinato speed
  rootMidi: number; // blended root (rounded later when voicing)
  scale: number[]; // current dominant region's scale (for voicing)
  sky: [number, number, number][]; // blended top/mid/bottom
  cloud: [number, number, number];
  sunAlt: number; // 0..1, 1 = sun highest (midday)
  moonAlt: number; // 0..1, 1 = moon highest (deep night)
  starAlpha: number; // 0..1 star visibility
  dominant: RegionName;
}

/** Sample the full blended day-state at a phase in [0,1). */
export function sampleDay(phase: number): DayState {
  const p = ((phase % 1) + 1) % 1;
  let total = 0;
  const weights: Record<RegionName, number> = {
    dawn: 0,
    morning: 0,
    midday: 0,
    dusk: 0,
    night: 0,
  };
  for (const r of REGIONS) {
    const w = regionWeight(p, REGION_CENTERS[r]);
    weights[r] = w;
    total += w;
  }
  if (total < 1e-4) {
    weights.dawn = 1;
    total = 1;
  }

  let brightness = 0;
  let bps = 0;
  let rootMidi = 0;
  let sky: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let cloud: [number, number, number] = [0, 0, 0];
  let dominant: RegionName = "dawn";
  let domW = -1;

  for (const r of REGIONS) {
    const w = weights[r] / total;
    const d = REGION_DATA[r];
    brightness += d.brightness * w;
    bps += d.bps * w;
    rootMidi += d.rootMidi * w;
    sky = [
      lerp3(sky[0], d.sky[0], w === 0 ? 0 : w),
      lerp3(sky[1], d.sky[1], w === 0 ? 0 : w),
      lerp3(sky[2], d.sky[2], w === 0 ? 0 : w),
    ];
    cloud = lerp3(cloud, d.cloud, w === 0 ? 0 : w);
    if (weights[r] > domW) {
      domW = weights[r];
      dominant = r;
    }
  }
  // The sky lerp above is not a true weighted mean; recompute cleanly:
  sky = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  cloud = [0, 0, 0];
  for (const r of REGIONS) {
    const w = weights[r] / total;
    const d = REGION_DATA[r];
    sky[0] = [
      sky[0][0] + d.sky[0][0] * w,
      sky[0][1] + d.sky[0][1] * w,
      sky[0][2] + d.sky[0][2] * w,
    ];
    sky[1] = [
      sky[1][0] + d.sky[1][0] * w,
      sky[1][1] + d.sky[1][1] * w,
      sky[1][2] + d.sky[1][2] * w,
    ];
    sky[2] = [
      sky[2][0] + d.sky[2][0] * w,
      sky[2][1] + d.sky[2][1] * w,
      sky[2][2] + d.sky[2][2] * w,
    ];
    cloud = [
      cloud[0] + d.cloud[0] * w,
      cloud[1] + d.cloud[1] * w,
      cloud[2] + d.cloud[2] * w,
    ];
  }

  // Sun travels a full arc across the daylight (phase 0..0.78), highest at
  // midday (~0.42). Moon owns the night (phase 0.78..1 and 0..0.08).
  // sunAlt: a raised-cosine peaking at midday center.
  const sunAlt = Math.max(0, Math.cos((p - 0.42) * Math.PI / 0.5));
  // moon alt: peaks near 0.9
  let md = Math.abs(p - 0.9);
  if (md > 0.5) md = 1 - md;
  const moonAlt = Math.max(0, Math.cos(md * Math.PI / 0.28));
  const starAlpha = Math.max(0, Math.min(1, (weights.night / total) * 1.4));

  return {
    phase: p,
    brightness,
    bps,
    rootMidi,
    scale: REGION_DATA[dominant].scale,
    sky,
    cloud,
    sunAlt,
    moonAlt: Math.min(1, moonAlt),
    starAlpha,
    dominant,
  };
}

// --- Motif memory bank ---------------------------------------------------

export interface Motif {
  // abstract scale-degree indices (into whatever scale is current)
  degrees: number[];
  // rhythm in beats (relative), same length as degrees
  rhythm: number[];
  octave: number; // base octave shift in octaves
  mutateSeed: number; // per-motif RNG seed for stable-ish mutation
}

export interface Thing {
  id: number;
  kind: Kind;
  x: number; // CSS px
  y: number; // CSS px
  hue: number; // color = pitch register
  birthPhase: number; // phase planted (for aging)
  motif: Motif;
  // visual animation state
  wakeful: number; // 0..1 smoothed "awake" amount, updated per frame
  swayPhase: number;
  lastSungAt: number; // audio time of last note (for twinkle)
  // playback cursor through the (mutated) motif, advanced by the scheduler
  nextNoteIdx?: number;
}

let _seed = 1234567;
function rng() {
  // small deterministic LCG so mutations are reproducible per call sequence
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

export function makeMotif(kind: Kind): Motif {
  // each kind has a characteristic shape; degrees are indices into a scale
  let degrees: number[];
  let rhythm: number[];
  let octave: number;
  if (kind === "flower") {
    degrees = [0, 2, 4].slice(0, 2 + Math.floor(rng() * 2));
    rhythm = degrees.map(() => 1 + Math.floor(rng() * 2));
    octave = 0;
  } else if (kind === "bird") {
    degrees = [4, 6, 5, 7].slice(0, 2 + Math.floor(rng() * 3));
    rhythm = degrees.map(() => (rng() < 0.5 ? 0.5 : 1));
    octave = 1;
  } else {
    degrees = [0, 3, 5].slice(0, 2 + Math.floor(rng() * 2));
    rhythm = degrees.map(() => 2 + Math.floor(rng() * 2));
    octave = -1;
  }
  return { degrees, rhythm, octave, mutateSeed: Math.floor(rng() * 1e6) };
}

// Map a scale-degree index + octave to a frequency in the CURRENT region's
// scale and root. This is the RE-VOICING step: the same abstract motif lands
// on different concrete pitches as the day's harmony evolves.
export function voiceDegree(
  day: DayState,
  degree: number,
  octave: number
): number {
  const scale = day.scale;
  const len = scale.length;
  // wrap degree into scale, carrying octaves
  let idx = degree;
  let oct = octave;
  while (idx >= len) {
    idx -= len;
    oct += 1;
  }
  while (idx < 0) {
    idx += len;
    oct -= 1;
  }
  const semis = scale[idx] + oct * 12;
  const midi = Math.round(day.rootMidi) + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Slowly mutate a motif according to how far the day has travelled since the
// thing was planted. Returns a *view* of degrees to play this cycle (we don't
// destroy the stored motif — anchored cyclic generation keeps the original).
export function mutatedDegrees(motif: Motif, age: number): number[] {
  // age in [0, ~1.5+] phase-units. Mutation grows with age but stays gentle.
  const m = Math.min(1, age);
  const out = motif.degrees.slice();
  // transpose up by step as the motif ages (re-voiced, so still in-scale)
  const transpose = Math.round(m * 2);
  for (let i = 0; i < out.length; i++) out[i] += transpose;
  // ornament: occasionally insert a neighbor tone
  if (m > 0.5 && out.length > 1) {
    out.splice(1, 0, out[0] + 1);
  }
  // thin out at high age (sparser, like settling into night)
  if (m > 0.85 && out.length > 2) {
    out.pop();
  }
  return out;
}

// How "awake" a thing should be at a given day-state (drives volume + visuals).
export function wakefulness(kind: Kind, day: DayState): number {
  const p = day.phase;
  // bell-ish curves over phase
  const bump = (center: number, width: number) => {
    let d = Math.abs(p - center);
    if (d > 0.5) d = 1 - d;
    return Math.max(0, 1 - d / width);
  };
  if (kind === "flower") {
    // awake morning..midday, closing at dusk, asleep at night
    return Math.min(1, bump(0.32, 0.34));
  }
  if (kind === "bird") {
    // sings in morning, quiet at night
    return Math.min(1, bump(0.25, 0.26) * 1.1);
  }
  // star: only at night
  return Math.min(1, bump(0.88, 0.2) * 1.3);
}
