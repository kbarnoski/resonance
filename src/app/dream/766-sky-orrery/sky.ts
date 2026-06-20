// Local-astronomy math for "766 · Sky Orrery".
// COPIED (and extended) from 347-the-place/astronomy.ts so this prototype is
// fully self-contained — NO cross-prototype import. All math is LOCAL: no
// network, no ephemeris. Approximations are intentional; plausible motion of
// the sky matters more than arc-second accuracy.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type Horizontal = {
  /** altitude in degrees, -90 (nadir) .. +90 (zenith) */
  altDeg: number;
  /** azimuth in degrees, 0 = North, 90 = East, 180 = South, 270 = West */
  azDeg: number;
};

export type Body = {
  id: string;
  name: string;
  kind: "sun" | "moon" | "planet" | "star";
  /** right ascension in HOURS (0..24) for fixed bodies; ignored for sun/moon */
  raHours: number;
  /** declination in degrees for fixed bodies; ignored for sun/moon */
  decDeg: number;
  /** display tint */
  color: string;
  /** intrinsic brightness 0..1 (drives sprite scale + base voice gain ceiling) */
  mag: number;
  altDeg: number;
  azDeg: number;
};

export type SkyState = {
  hours: number;
  dayOfYear: number;
  yearFrac: number;
  sunAltDeg: number;
  sunAzDeg: number;
  moonAltDeg: number;
  moonAzDeg: number;
  moonIllum: number;
  moonPhase: number;
  /** Local Sidereal Time in hours, 0..24 */
  lstHours: number;
  lat: number;
  lon: number;
  bodies: Body[];
};

export function computeDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export function computeLocalHours(d: Date): number {
  return (
    d.getHours() +
    d.getMinutes() / 60 +
    d.getSeconds() / 3600 +
    d.getMilliseconds() / 3.6e6
  );
}

/** Solar declination (deg). Cooper's approximation. */
function computeSolarDecl(dayOfYear: number): number {
  return 23.45 * Math.sin(DEG * (360 * (284 + dayOfYear)) / 365);
}

/** Equation of time (minutes). */
function computeEoT(dayOfYear: number): number {
  const b = DEG * ((360 / 364) * (dayOfYear - 81));
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** Apparent solar (hour-angle) time in hours. */
function computeSolarTime(
  dayOfYear: number,
  localHours: number,
  lonDeg: number,
  tzOffsetHours: number,
): number {
  const lstm = 15 * tzOffsetHours;
  const tc = 4 * (lonDeg - lstm) + computeEoT(dayOfYear); // minutes
  return localHours + tc / 60;
}

/** Convert hour-angle (deg) + declination (deg) to alt/az for a latitude. */
function horizontalFromHADec(
  haDeg: number,
  declDeg: number,
  latDeg: number,
): Horizontal {
  const latR = latDeg * DEG;
  const declR = declDeg * DEG;
  const haR = haDeg * DEG;

  const sinAlt =
    Math.sin(latR) * Math.sin(declR) +
    Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
  const altR = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz =
    (Math.sin(declR) - Math.sin(altR) * Math.sin(latR)) /
    (Math.cos(altR) * Math.cos(latR) || 1e-6);
  let azR = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  // Positive hour angle → object is west of meridian.
  if (haDeg > 0) azR = 2 * Math.PI - azR;

  return { altDeg: altR * RAD, azDeg: azR * RAD };
}

export function computeSunPosition(
  dayOfYear: number,
  localHours: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetHours: number,
): Horizontal {
  const decl = computeSolarDecl(dayOfYear);
  const solarTime = computeSolarTime(dayOfYear, localHours, lonDeg, tzOffsetHours);
  const ha = 15 * (solarTime - 12);
  return horizontalFromHADec(ha, decl, latDeg);
}

/**
 * Moon synodic phase + a SIMPLE moon position. We model the moon's ecliptic
 * longitude as the sun's plus the phase offset, and convert through a coarse
 * obliquity tilt. This is not an ephemeris but moves plausibly (rises ~50min
 * later each day, sits near the ecliptic).
 */
export function computeMoonPhase(date: Date): { phase: number; illum: number } {
  const refNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodic = 29.530588853;
  const days = (date.getTime() - refNewMoon) / 86400000;
  let phase = (days % synodic) / synodic;
  if (phase < 0) phase += 1;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return { phase, illum };
}

/** Greenwich Mean Sidereal Time (hours) for a Date. Low precision. */
function computeGMST(date: Date): number {
  // Julian date.
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0; // days from J2000
  let gmst = 18.697374558 + 24.06570982441908 * d; // hours
  gmst = ((gmst % 24) + 24) % 24;
  return gmst;
}

/** Local Sidereal Time (hours) for a longitude. */
export function computeLST(date: Date, lonDeg: number): number {
  const gmst = computeGMST(date);
  let lst = gmst + lonDeg / 15;
  lst = ((lst % 24) + 24) % 24;
  return lst;
}

function moonEclipticLongitude(date: Date): number {
  // Mean longitude of the moon, deg. Simplified (Meeus, leading terms only).
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  let lon =
    218.316 +
    481267.881 * t +
    6.29 * Math.sin(DEG * (134.9 + 477198.85 * t)) -
    1.27 * Math.sin(DEG * (259.2 - 413335.38 * t)) +
    0.66 * Math.sin(DEG * (235.7 + 890534.23 * t));
  lon = ((lon % 360) + 360) % 360;
  return lon;
}

/** Convert ecliptic longitude (deg, lat≈0) to equatorial RA(hours)/Dec(deg). */
function eclipticToEquatorial(lonDeg: number): { raHours: number; decDeg: number } {
  const obl = 23.439 * DEG;
  const l = lonDeg * DEG;
  const ra = Math.atan2(Math.cos(obl) * Math.sin(l), Math.cos(l));
  const dec = Math.asin(Math.sin(obl) * Math.sin(l));
  let raHours = (ra * RAD) / 15;
  raHours = ((raHours % 24) + 24) % 24;
  return { raHours, decDeg: dec * RAD };
}

/** A handful of genuinely bright fixed bodies (J2000 RA/Dec). */
const FIXED_BODIES: Omit<Body, "altDeg" | "azDeg">[] = [
  { id: "sirius", name: "Sirius", kind: "star", raHours: 6.752, decDeg: -16.72, color: "#bcd4ff", mag: 1.0 },
  { id: "vega", name: "Vega", kind: "star", raHours: 18.615, decDeg: 38.78, color: "#dbe6ff", mag: 0.86 },
  { id: "arcturus", name: "Arcturus", kind: "star", raHours: 14.261, decDeg: 19.18, color: "#ffd9a8", mag: 0.84 },
  { id: "betelgeuse", name: "Betelgeuse", kind: "star", raHours: 5.919, decDeg: 7.41, color: "#ffb88a", mag: 0.78 },
  { id: "rigel", name: "Rigel", kind: "star", raHours: 5.242, decDeg: -8.2, color: "#cfe0ff", mag: 0.76 },
  { id: "altair", name: "Altair", kind: "star", raHours: 19.846, decDeg: 8.87, color: "#eef3ff", mag: 0.7 },
  { id: "jupiter", name: "Jupiter", kind: "planet", raHours: 4.2, decDeg: 20.0, color: "#ffe6b0", mag: 0.95 },
  { id: "venus", name: "Venus", kind: "planet", raHours: 3.4, decDeg: 18.0, color: "#fff3d6", mag: 0.92 },
];

/** Hour angle (deg) for a fixed RA given Local Sidereal Time. */
function hourAngleDeg(lstHours: number, raHours: number): number {
  let ha = (lstHours - raHours) * 15; // deg
  ha = ((ha + 180) % 360 + 360) % 360 - 180; // wrap to -180..180
  return ha;
}

export function computeSkyState(
  date: Date,
  latDeg: number,
  lonDeg: number,
): SkyState {
  const dayOfYear = computeDayOfYear(date);
  const hours = computeLocalHours(date);
  const tzOffsetHours = -date.getTimezoneOffset() / 60;

  const sun = computeSunPosition(dayOfYear, hours, latDeg, lonDeg, tzOffsetHours);
  const { phase, illum } = computeMoonPhase(date);
  const lst = computeLST(date, lonDeg);

  // Moon position from its ecliptic longitude.
  const moonLon = moonEclipticLongitude(date);
  const moonEq = eclipticToEquatorial(moonLon);
  const moonHA = hourAngleDeg(lst, moonEq.raHours);
  const moon = horizontalFromHADec(moonHA, moonEq.decDeg, latDeg);

  const bodies: Body[] = FIXED_BODIES.map((b) => {
    const ha = hourAngleDeg(lst, b.raHours);
    const h = horizontalFromHADec(ha, b.decDeg, latDeg);
    return { ...b, altDeg: h.altDeg, azDeg: h.azDeg };
  });

  const yearFrac = (dayOfYear % 365) / 365;
  return {
    hours,
    dayOfYear,
    yearFrac,
    sunAltDeg: sun.altDeg,
    sunAzDeg: sun.azDeg,
    moonAltDeg: moon.altDeg,
    moonAzDeg: moon.azDeg,
    moonIllum: illum,
    moonPhase: phase,
    lstHours: lst,
    lat: latDeg,
    lon: lonDeg,
    bodies,
  };
}

/** Build a Date that is "now", but with hour-of-day forced for time-scrubbing. */
export function dateWithForcedHour(base: Date, hourOfDay: number): Date {
  const d = new Date(base.getTime());
  const h = Math.floor(hourOfDay);
  const m = Math.floor((hourOfDay - h) * 60);
  const s = Math.floor((((hourOfDay - h) * 60) - m) * 60);
  d.setHours(h, m, s, 0);
  return d;
}

/** A human-readable label for the moment of day from solar altitude. */
export function moodLabel(sunAltDeg: number): string {
  const a = sunAltDeg;
  if (a > 35) return "high noon — bright, open phrasing";
  if (a > 8) return "broad day — major air, full voices";
  if (a > -0.5) return "golden hour — warm bloom";
  if (a > -6) return "civil twilight — the cluster forms";
  if (a > -12) return "nautical dusk — voices sink";
  if (a > -18) return "astronomical dark — deep reverb";
  return "deep night — the low root alone";
}

/** Moon phase name. */
export function moonPhaseName(phase: number): string {
  const p = phase;
  if (p < 0.03 || p > 0.97) return "new moon";
  if (p < 0.22) return "waxing crescent";
  if (p < 0.28) return "first quarter";
  if (p < 0.47) return "waxing gibbous";
  if (p < 0.53) return "full moon";
  if (p < 0.72) return "waning gibbous";
  if (p < 0.78) return "last quarter";
  return "waning crescent";
}

/** Normalized daylight factor 0 (deep night) .. 1 (bright day) from sun alt. */
export function daylightFactor(sunAltDeg: number): number {
  // Smooth ramp from -12deg (dark) to +6deg (full day).
  const t = (sunAltDeg + 12) / 18;
  return Math.max(0, Math.min(1, t));
}
