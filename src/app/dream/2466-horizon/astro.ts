// ─────────────────────────────────────────────────────────────────────────────
// 2466 · HORIZON — astronomy core
//
// Implements Paul Schlyter's low-precision planetary-position algorithm
// ("Computing planetary positions — a tutorial with worked examples"). Simple
// Keplerian orbital elements linear in the day-number `d` give ecliptic
// lon/lat good to ~1-2°, entirely offline, zero network. That is exactly the
// fidelity this piece wants: enough to know where the Sun, Moon and naked-eye
// planets sit over your head *right now* — for singing, not for navigation.
//
// Pipeline per body:
//   1. day number d from a JS Date (UTC)
//   2. Keplerian elements → rectangular orbital coords → ecliptic x/y/z
//      (heliocentric for planets + Sun's own coords added; Moon geocentric)
//   3. ecliptic → equatorial (RA/Dec) via obliquity ecl
//   4. RA/Dec → altitude/azimuth via Local Sidereal Time + observer lat/lon
// ─────────────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const sind = (x: number) => Math.sin(x * DEG);
const cosd = (x: number) => Math.cos(x * DEG);
const atan2d = (y: number, x: number) => Math.atan2(y, x) * RAD;
const asind = (x: number) => Math.asin(x) * RAD;

// Normalise an angle in degrees to [0, 360).
function rev(x: number): number {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}

export interface Body {
  name: string;
  altitude: number; // degrees, + above horizon
  azimuth: number; // degrees, 0=N, 90=E, 180=S, 270=W
  distanceAU: number; // geocentric distance in AU (Moon in AU too)
  magnitudeHint: number; // rough apparent magnitude (smaller = brighter)
  eclLon: number; // geocentric ecliptic longitude (deg) — used for Moon phase
}

export interface SkyState {
  bodies: Body[];
  sunAltitude: number; // convenience: drives sky colour
  moonPhase: number; // illuminated fraction 0..1
  moonWaxing: boolean; // true = crescent lit on the "leading" side
  d: number; // day number used
}

// Keplerian orbital elements (degrees / AU) as functions of day number d.
// From Schlyter's tutorial. `a` for the Moon is 60.2666 Earth radii — we
// convert its final geocentric distance to AU at the end.
interface Elements {
  N: number; // longitude of ascending node
  i: number; // inclination
  w: number; // argument of perihelion
  a: number; // semi-major axis (AU, except Moon: Earth radii)
  e: number; // eccentricity
  M: number; // mean anomaly
}

function sunElements(d: number): Elements {
  return {
    N: 0,
    i: 0,
    w: 282.9404 + 4.70935e-5 * d,
    a: 1.0,
    e: 0.016709 - 1.151e-9 * d,
    M: 356.047 + 0.9856002585 * d,
  };
}

function elementsFor(name: string, d: number): Elements {
  switch (name) {
    case "Moon":
      return {
        N: 125.1228 - 0.0529538083 * d,
        i: 5.1454,
        w: 318.0634 + 0.1643573223 * d,
        a: 60.2666, // Earth radii
        e: 0.0549,
        M: 115.3654 + 13.0649929509 * d,
      };
    case "Mercury":
      return {
        N: 48.3313 + 3.24587e-5 * d,
        i: 7.0047 + 5.0e-8 * d,
        w: 29.1241 + 1.01444e-5 * d,
        a: 0.387098,
        e: 0.205635 + 5.59e-10 * d,
        M: 168.6562 + 4.0923344368 * d,
      };
    case "Venus":
      return {
        N: 76.6799 + 2.4659e-5 * d,
        i: 3.3946 + 2.75e-8 * d,
        w: 54.891 + 1.38374e-5 * d,
        a: 0.72333,
        e: 0.006773 - 1.302e-9 * d,
        M: 48.0052 + 1.6021302244 * d,
      };
    case "Mars":
      return {
        N: 49.5574 + 2.11081e-5 * d,
        i: 1.8497 - 1.78e-8 * d,
        w: 286.5016 + 2.92961e-5 * d,
        a: 1.523688,
        e: 0.093405 + 2.516e-9 * d,
        M: 18.6021 + 0.5240207766 * d,
      };
    case "Jupiter":
      return {
        N: 100.4542 + 2.76854e-5 * d,
        i: 1.303 - 1.557e-7 * d,
        w: 273.8777 + 1.64505e-5 * d,
        a: 5.20256,
        e: 0.048498 + 4.469e-9 * d,
        M: 19.895 + 0.0830853001 * d,
      };
    case "Saturn":
      return {
        N: 113.6634 + 2.3898e-5 * d,
        i: 2.4886 - 1.081e-7 * d,
        w: 339.3939 + 2.97661e-5 * d,
        a: 9.55475,
        e: 0.055546 - 9.499e-9 * d,
        M: 316.967 + 0.0334442282 * d,
      };
    default:
      return sunElements(d);
  }
}

// Rough apparent magnitudes — a size/brightness hint only, not computed.
const MAG_HINT: Record<string, number> = {
  Sun: -26.7,
  Moon: -12.7,
  Venus: -4.1,
  Jupiter: -2.2,
  Mars: 0.7,
  Mercury: 0.0,
  Saturn: 0.6,
};

const EARTH_RADII_PER_AU = 23454.8; // 1 AU / Earth radius

// The day number. Schlyter: integer divisions are FLOORED; UT (hours) adds a
// fractional day. We derive Y/M/D/UT from the Date's UTC fields.
export function computeDayNumber(date: Date): number {
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D = date.getUTCDate();
  const UT =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const d =
    367 * Y -
    Math.floor((7 * (Y + Math.floor((M + 9) / 12))) / 4) +
    Math.floor((275 * M) / 9) +
    D -
    730530;
  return d + UT / 24;
}

// Solve Kepler's equation for eccentric anomaly E (degrees).
function computeEccentricAnomaly(M: number, e: number): number {
  let E = M + e * RAD * sind(M) * (1 + e * cosd(M));
  // Iterate (matters for the Moon / Mercury with larger e).
  for (let k = 0; k < 8; k++) {
    const dE =
      (E - e * RAD * sind(E) - M) / (1 - e * cosd(E));
    E -= dE;
    if (Math.abs(dE) < 1e-6) break;
  }
  return E;
}

interface EclXYZ {
  x: number;
  y: number;
  z: number;
  r: number; // heliocentric (or geocentric, for Moon) distance
}

// Body's rectangular ecliptic coords from its orbital elements.
function computeOrbitXYZ(el: Elements): EclXYZ {
  const E = computeEccentricAnomaly(el.M, el.e);
  const xv = el.a * (cosd(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sind(E);
  const v = atan2d(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const vw = v + el.w;
  const x =
    r * (cosd(el.N) * cosd(vw) - sind(el.N) * sind(vw) * cosd(el.i));
  const y =
    r * (sind(el.N) * cosd(vw) + cosd(el.N) * sind(vw) * cosd(el.i));
  const z = r * (sind(vw) * sind(el.i));
  return { x, y, z, r };
}

const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;

// Full sky solution for a given instant + observer.
// lat/lon in degrees (lon east-positive).
export function computeSky(date: Date, latDeg: number, lonDeg: number): SkyState {
  const d = computeDayNumber(date);
  const ecl = 23.4393 - 3.563e-7 * d; // obliquity of the ecliptic

  // ── Sun (needed for both its own position and sidereal time) ──────────────
  const sunEl = sunElements(d);
  const Esun = computeEccentricAnomaly(sunEl.M, sunEl.e);
  const xvS = cosd(Esun) - sunEl.e;
  const yvS = Math.sqrt(1 - sunEl.e * sunEl.e) * sind(Esun);
  const vS = atan2d(yvS, xvS);
  const rS = Math.sqrt(xvS * xvS + yvS * yvS);
  const lonsun = rev(vS + sunEl.w); // Sun's true ecliptic longitude
  const xs = rS * cosd(lonsun); // Sun geocentric ecliptic rectangular
  const ys = rS * sind(lonsun);

  // Sun's mean longitude Ls → GMST0 → Local Sidereal Time (all degrees).
  const Ls = rev(sunEl.M + sunEl.w);
  const UT =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const GMST0 = Ls + 180;
  const LST = rev(GMST0 + UT * 15 + lonDeg);

  // RA/Dec + alt/az from ecliptic-equatorial rectangular coords.
  function radecToAltAz(
    xe: number,
    ye: number,
    ze: number,
  ): { alt: number; az: number; ra: number; dec: number; dist: number } {
    const ra = rev(atan2d(ye, xe));
    const dec = atan2d(ze, Math.sqrt(xe * xe + ye * ye));
    const dist = Math.sqrt(xe * xe + ye * ye + ze * ze);
    const HA = rev(LST - ra); // hour angle, degrees
    // To local horizontal coords.
    const x = cosd(HA) * cosd(dec);
    const y = sind(HA) * cosd(dec);
    const z = sind(dec);
    const xhor = x * sind(latDeg) - z * cosd(latDeg);
    const yhor = y;
    const zhor = x * cosd(latDeg) + z * sind(latDeg);
    const az = rev(atan2d(yhor, xhor) + 180); // 0=N, 90=E, 180=S, 270=W
    const alt = asind(zhor);
    return { alt, az, ra, dec, dist };
  }

  const bodies: Body[] = [];

  // Sun: on the ecliptic (z=0) → equatorial rotation about x.
  {
    const xe = xs;
    const ye = ys * cosd(ecl);
    const ze = ys * sind(ecl);
    const { alt, az, dist } = radecToAltAz(xe, ye, ze);
    bodies.push({
      name: "Sun",
      altitude: alt,
      azimuth: az,
      distanceAU: dist,
      magnitudeHint: MAG_HINT.Sun,
      eclLon: lonsun,
    });
  }

  // Moon: geocentric already; convert Earth-radii distance to AU.
  let moonEclLon = 0;
  {
    const el = elementsFor("Moon", d);
    const p = computeOrbitXYZ(el);
    // ecliptic → equatorial
    const xe = p.x;
    const ye = p.y * cosd(ecl) - p.z * sind(ecl);
    const ze = p.y * sind(ecl) + p.z * cosd(ecl);
    const { alt, az } = radecToAltAz(xe, ye, ze);
    moonEclLon = rev(atan2d(p.y, p.x));
    bodies.push({
      name: "Moon",
      altitude: alt,
      azimuth: az,
      distanceAU: p.r / EARTH_RADII_PER_AU,
      magnitudeHint: MAG_HINT.Moon,
      eclLon: moonEclLon,
    });
  }

  // Planets: heliocentric → add Sun's geocentric coords → geocentric ecliptic.
  for (const name of PLANETS) {
    const el = elementsFor(name, d);
    const p = computeOrbitXYZ(el);
    const xg = p.x + xs;
    const yg = p.y + ys;
    const zg = p.z;
    const xe = xg;
    const ye = yg * cosd(ecl) - zg * sind(ecl);
    const ze = yg * sind(ecl) + zg * cosd(ecl);
    const { alt, az, dist } = radecToAltAz(xe, ye, ze);
    bodies.push({
      name,
      altitude: alt,
      azimuth: az,
      distanceAU: dist,
      magnitudeHint: MAG_HINT[name],
      eclLon: rev(atan2d(yg, xg)),
    });
  }

  // Moon phase from Sun/Moon ecliptic-longitude elongation.
  const elong = rev(moonEclLon - lonsun); // 0=new, 180=full
  const moonPhase = (1 - cosd(elong)) / 2; // illuminated fraction 0..1
  const moonWaxing = elong < 180;

  const sun = bodies[0];
  return {
    bodies,
    sunAltitude: sun.altitude,
    moonPhase,
    moonWaxing,
    d,
  };
}

// Sidereal orbital periods (days) — the REAL periods, for the audio pitch map.
// Kepler's Harmonices Mundi (1619) tied period to pitch; here faster = higher.
// The Sun's voice uses Earth's orbital period (the Sun's apparent yearly march).
export const SIDEREAL_PERIODS: Record<string, number> = {
  Moon: 27.321661,
  Mercury: 87.9691,
  Venus: 224.701,
  Sun: 365.256363,
  Mars: 686.98,
  Jupiter: 4332.589,
  Saturn: 10759.22,
};

// ── Self-check (dev only) ────────────────────────────────────────────────────
// Sanity: at the SF fallback location the Sun should be ABOVE the horizon
// around local noon and BELOW it around local midnight. Call once from a
// browser effect; it no-ops on the server.
export function runSelfCheck(): void {
  if (typeof console === "undefined") return;
  const lat = 37.77;
  const lon = -122.42; // ~PDT = UTC-7 in July, so local noon ≈ 19:00 UTC
  const noon = computeSky(new Date(Date.UTC(2026, 6, 15, 19, 0, 0)), lat, lon);
  const midnight = computeSky(
    new Date(Date.UTC(2026, 6, 15, 7, 0, 0)),
    lat,
    lon,
  );
  console.assert(
    noon.sunAltitude > 0,
    `[2466-horizon] self-check: expected Sun up at local noon, got alt=${noon.sunAltitude.toFixed(1)}°`,
  );
  console.assert(
    midnight.sunAltitude < 0,
    `[2466-horizon] self-check: expected Sun down at local midnight, got alt=${midnight.sunAltitude.toFixed(1)}°`,
  );
}
