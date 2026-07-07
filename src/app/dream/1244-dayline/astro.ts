// 1244-dayline — offline solar-geometry engine.
//
// Pure functions, no React, no network, no DOM. Everything needed to place the
// sun, decide which half of the Earth is lit, and detect dawn/dusk crossings.
//
// Deliberate simplifications (documented in README.md):
//   • Solar declination via the standard cosine approximation.
//   • No equation-of-time (mean vs. apparent solar time is ignored).
//   • No atmospheric refraction (horizon is treated as a hard alt = 0).
// These are fine for a musical sequencer; they would be wrong for navigation.

export const DEG = Math.PI / 180;

/** Day-of-year N (1..366) for a UTC timestamp (ms since epoch). */
export function dayOfYear(utcMs: number): number {
  const d = new Date(utcMs);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const diff = utcMs - start;
  return Math.floor(diff / 86_400_000) + 1;
}

/** Fractional UTC hours (0..24) for a UTC timestamp (ms since epoch). */
export function utcHours(utcMs: number): number {
  const d = new Date(utcMs);
  return (
    d.getUTCHours() +
    d.getUTCMinutes() / 60 +
    d.getUTCSeconds() / 3600 +
    d.getUTCMilliseconds() / 3_600_000
  );
}

/** Solar declination δ in degrees: -23.44° · cos(360/365 · (N + 10)). */
export function solarDeclinationDeg(utcMs: number): number {
  const n = dayOfYear(utcMs);
  return -23.44 * Math.cos(DEG * ((360 / 365) * (n + 10)));
}

/** Longitude (deg, -180..180) directly beneath the sun. */
export function subsolarLonDeg(utcMs: number): number {
  const h = utcHours(utcMs);
  let lon = -15 * (h - 12);
  // Wrap into [-180, 180).
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return lon;
}

/** The point on Earth where the sun is at the zenith. */
export interface Subsolar {
  latDeg: number;
  lonDeg: number;
  decl: number;
}

export function subsolarPoint(utcMs: number): Subsolar {
  const decl = solarDeclinationDeg(utcMs);
  return { latDeg: decl, lonDeg: subsolarLonDeg(utcMs), decl };
}

/**
 * Solar altitude (deg, -90..90) at a location, given a precomputed subsolar
 * point. Positive = sun above horizon (lit); negative = below (night).
 *   sin(alt) = sin(lat)·sin(δ) + cos(lat)·cos(δ)·cos(lon - subLon)
 */
export function solarAltitudeDeg(
  latDeg: number,
  lonDeg: number,
  sub: Subsolar,
): number {
  const lat = latDeg * DEG;
  const decl = sub.decl * DEG;
  let dLon = lonDeg - sub.lonDeg;
  // Shortest angular distance in longitude.
  dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
  const sinAlt =
    Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(dLon * DEG);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
}
