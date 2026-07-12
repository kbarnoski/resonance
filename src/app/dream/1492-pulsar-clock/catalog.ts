// ─────────────────────────────────────────────────────────────────────────────
// catalog.ts — the embedded REAL pulsar catalog + the period→audio-behaviour
// mapper (subsystem "a"). No THREE, no Web Audio here: pure deterministic data.
//
// Every position is derived from the pulsar's REAL designation. A pulsar name
// like "PSR B1919+21" encodes its sky coordinates: RA 19h19m, Dec +21°. So the
// sky you see is genuinely where these neutron stars sit — Vela low in the
// southern sky, the Crab up near the ecliptic, Bell Burnell's B1919+21 in
// Vulpecula. Rotation periods are the measured spin periods of the real objects.
//
// The six invented fill-in pulsars are generated deterministically from a
// mulberry32 PRNG (constant seed) so the sky is byte-identical every run — and
// even their names are formatted from the coordinates the PRNG assigned, so a
// "PSR J####±##" label still honestly matches where it hangs.
// ─────────────────────────────────────────────────────────────────────────────

/** Radius of the great celestial sphere the pulsars sit on (world units). */
export const SKY_RADIUS = 320;

/** Deterministic 32-bit PRNG. Seeded once; NO Math.random anywhere in the piece. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Slow discrete clicks, low pitched drone, or the vast cathedral toll. */
export type PulsarKind = "pitched" | "click" | "bell";

export interface Pulsar {
  name: string;
  /** Rotation period in milliseconds (the REAL measured spin period). */
  periodMs: number;
  periodSec: number;
  /** 1 / period — the pitch a millisecond pulsar fuses into. */
  freqHz: number;
  kind: PulsarKind;
  raHours: number;
  decDeg: number;
  /** Unit direction on the celestial sphere (y-up). */
  dir: readonly [number, number, number];
  /** True for the catalogued real objects, false for deterministic fill-ins. */
  real: boolean;
}

/**
 * Behaviour threshold. Millisecond pulsars whose 1/period lands in the audio
 * range fuse into a PITCHED continuous tone; the Crab at 33.5 ms (~30 Hz) sits
 * right on the low buzz/click boundary and is treated as a pitched sub-buzz.
 * Second-scale pulsars are the discrete rhythm section; anything ≥10 s is a
 * single vast bell toll (J0901−4046 is the cathedral bell).
 */
export function classify(periodMs: number): PulsarKind {
  if (periodMs <= 45) return "pitched";
  if (periodMs >= 10000) return "bell";
  return "click";
}

/** RA (hours) + Dec (degrees) → unit vector on a y-up celestial sphere. */
function dirFromRaDec(
  raHours: number,
  decDeg: number,
): readonly [number, number, number] {
  const ra = ((raHours * 15) * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cd = Math.cos(dec);
  return [cd * Math.cos(ra), Math.sin(dec), cd * Math.sin(ra)] as const;
}

function makePulsar(
  name: string,
  periodMs: number,
  raHours: number,
  decDeg: number,
  real: boolean,
): Pulsar {
  const periodSec = periodMs / 1000;
  return {
    name,
    periodMs,
    periodSec,
    freqHz: 1 / periodSec,
    kind: classify(periodMs),
    raHours,
    decDeg,
    dir: dirFromRaDec(raHours, decDeg),
    real,
  };
}

// Real objects — [name, periodMs, RA(hours), Dec(deg)]. Coordinates read off the
// designation; periods are the measured spin periods.
const REAL: ReadonlyArray<[string, number, number, number]> = [
  ["PSR B1937+21", 1.558, 19.617, 21.0], // first millisecond pulsar → ~642 Hz
  ["PSR B1957+20", 1.607, 19.95, 20.0], // "black widow" → ~622 Hz
  ["PSR J0437-4715", 5.757, 4.617, -47.25], // nearest ms pulsar → ~174 Hz
  ["PSR B0531+21 (Crab)", 33.5, 5.517, 21.0], // ~30 Hz low buzz/click boundary
  ["PSR B0833-45 (Vela)", 89.3, 8.55, -45.0], // discrete clicks ~11/s
  ["PSR J0633+1746 (Geminga)", 237.0, 6.55, 17.767],
  ["PSR B0329+54", 714.5, 3.483, 54.0],
  ["PSR B1919+21", 1337.0, 19.317, 21.0], // Bell Burnell's 1967 discovery
  ["PSR J0901-4046", 75900.0, 9.017, -40.767], // ultra-long-period cathedral bell
];

// Deterministic fill-ins. Periods (ms) are fixed constants spanning the
// click→bell range; RA/Dec come from the seeded PRNG and the name is formatted
// from those coordinates so it matches the sky position.
const FILL_PERIODS_MS: readonly number[] = [156, 253, 489, 1050, 2340, 12600];

function jname(raHours: number, decDeg: number): string {
  const hh = String(Math.floor(raHours)).padStart(2, "0");
  const mm = String(Math.floor((raHours % 1) * 60)).padStart(2, "0");
  const sign = decDeg >= 0 ? "+" : "-";
  const dd = String(Math.floor(Math.abs(decDeg))).padStart(2, "0");
  return `PSR J${hh}${mm}${sign}${dd}`;
}

function buildCatalog(): Pulsar[] {
  const list: Pulsar[] = REAL.map(([n, p, ra, dec]) =>
    makePulsar(n, p, ra, dec, true),
  );
  const rnd = mulberry32(0x1492c10c);
  for (const periodMs of FILL_PERIODS_MS) {
    const raHours = rnd() * 24;
    // Bias away from the exact poles so beams read cleanly; spread N/S evenly.
    const decDeg = (rnd() * 2 - 1) * 72;
    list.push(makePulsar(jname(raHours, decDeg), periodMs, raHours, decDeg, false));
  }
  return list;
}

/** The full sky: 9 real + 6 deterministic = 15 pulsars. Frozen at module load. */
export const PULSARS: readonly Pulsar[] = buildCatalog();
