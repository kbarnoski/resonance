// ─────────────────────────────────────────────────────────────────────────────
// 15440 · spheres — the celestial engine.
//
// Deterministic, offline heliocentric ecliptic positions for the six classical
// planets, from the JPL / E. M. Standish "Keplerian elements & rates" (the
// low-precision formulae, valid 1800–2050). Given a Unix-ms time we solve
// Kepler's equation and return each planet's true ecliptic longitude, distance
// and (flat, inclination ignored for the art) ecliptic-plane x/z in AU.
//
// From those longitudes we derive the astrological/geometric ASPECTS between
// every unordered pair — conjunction / sextile / square / trine / opposition,
// each within a ±6° orb — which the piece turns into both harmony lines and the
// swelling of Karel's piano voices.
//
// No network, no clock reads inside — pass the time in, get the same answer out.
// REFS: Standish low-precision planetary formulae (JPL); Kepler, Harmonices
// Mundi (1619), the angular-velocity extremes forming musical ratios.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanetElements {
  name: string;
  // [value@J2000, per-century rate] for a, e, I, L, longPeri (ϖ), longNode (Ω)
  a: [number, number];
  e: [number, number];
  I: [number, number];
  L: [number, number];
  peri: [number, number]; // ϖ, longitude of perihelion
  node: [number, number]; // Ω, longitude of ascending node
}

// The six classical planets (Sun-centred; Earth included as a voice).
export const ELEMENTS: readonly PlanetElements[] = [
  {
    name: "Mercury",
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    peri: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
  },
  {
    name: "Venus",
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    peri: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
  },
  {
    name: "Earth",
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    peri: [102.93768193, 0.32327364],
    node: [0.0, 0.0],
  },
  {
    name: "Mars",
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
  {
    name: "Jupiter",
    a: [5.208887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    peri: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
  },
  {
    name: "Saturn",
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    peri: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
  },
] as const;

const DEG = Math.PI / 180;

/** Wrap degrees into [0, 360). */
function wrap360(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Wrap degrees into [-180, 180]. */
function wrap180(d: number): number {
  let x = ((d + 180) % 360) - 180;
  if (x < -180) x += 360;
  return x;
}

export interface PlanetState {
  name: string;
  lambdaDeg: number; // true heliocentric ecliptic longitude, 0..360
  r: number; // heliocentric distance, AU
  x: number; // ecliptic-plane position, AU
  z: number;
}

/** Heliocentric ecliptic state for one planet at Unix-ms time `t`. */
export function computePlanet(el: PlanetElements, t: number): PlanetState {
  const JD = t / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525; // Julian centuries since J2000

  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const L = el.L[0] + el.L[1] * T;
  const peri = el.peri[0] + el.peri[1] * T;

  // Mean anomaly, wrapped to [-180,180] for a well-behaved Kepler solve.
  const M = wrap180(L - peri);
  const Mr = M * DEG;

  // Solve Kepler's equation E - e·sinE = M by Newton iteration.
  let E = Mr + e * Math.sin(Mr);
  for (let i = 0; i < 6; i++) {
    E -= (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
  }

  const nu = Math.atan2(
    Math.sqrt(1 - e * e) * Math.sin(E),
    Math.cos(E) - e,
  );
  const r = a * (1 - e * Math.cos(E));
  const lambdaDeg = wrap360(peri + (nu * 180) / Math.PI);
  const lr = lambdaDeg * DEG;

  return {
    name: el.name,
    lambdaDeg,
    r,
    x: r * Math.cos(lr),
    z: r * Math.sin(lr),
  };
}

/** Full sky snapshot at time `t`. */
export function computePlanets(t: number): PlanetState[] {
  return ELEMENTS.map((el) => computePlanet(el, t));
}

export type AspectKind =
  | "conjunction"
  | "sextile"
  | "square"
  | "trine"
  | "opposition";

export interface AspectDef {
  kind: AspectKind;
  angle: number;
  consonant: boolean;
}

// 0 / 60 / 120 are consonant (voices in tune); 90 / 180 are tense (subtle detune).
export const ASPECT_DEFS: readonly AspectDef[] = [
  { kind: "conjunction", angle: 0, consonant: true },
  { kind: "sextile", angle: 60, consonant: true },
  { kind: "square", angle: 90, consonant: false },
  { kind: "trine", angle: 120, consonant: true },
  { kind: "opposition", angle: 180, consonant: false },
] as const;

export const ORB = 6; // degrees

export interface Aspect {
  a: number; // planet index
  b: number; // planet index
  kind: AspectKind;
  consonant: boolean;
  tightness: number; // 1 at exact, 0 at edge of orb
}

/** Angular separation of two ecliptic longitudes, folded to 0..180. */
export function separation(lambdaA: number, lambdaB: number): number {
  const d = Math.abs(wrap180(lambdaA - lambdaB));
  return d; // wrap180 already yields 0..180 magnitude after abs
}

/** All in-orb aspects among the given planet states. */
export function computeAspects(planets: PlanetState[]): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const sep = separation(planets[i].lambdaDeg, planets[j].lambdaDeg);
      for (const def of ASPECT_DEFS) {
        const delta = Math.abs(sep - def.angle);
        if (delta <= ORB) {
          out.push({
            a: i,
            b: j,
            kind: def.kind,
            consonant: def.consonant,
            tightness: 1 - delta / ORB,
          });
        }
      }
    }
  }
  return out;
}
