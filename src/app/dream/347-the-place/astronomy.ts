// Local-astronomy math for "The Place Where You Go to Listen".
// All computations are LOCAL — no network, no API. Approximations are fine;
// this is a contemplative prototype, not an ephemeris.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type SkyState = {
  /** local wall-clock fractional hours (0..24) the sky was computed for */
  hours: number;
  /** day of year, 1..366 */
  dayOfYear: number;
  /** 0..1 progress around the year (0 = Jan 1) */
  yearFrac: number;
  /** solar altitude in degrees, -90 (deep below) .. +90 (zenith) */
  sunAltDeg: number;
  /** solar azimuth in degrees, 0 = North, 90 = East, 180 = South, 270 = West */
  sunAzDeg: number;
  /** moon illuminated fraction, 0 (new) .. 1 (full) */
  moonIllum: number;
  /** synodic phase, 0 = new .. 0.5 = full .. 1 = new */
  moonPhase: number;
  /** latitude / longitude actually used */
  lat: number;
  lon: number;
};

/** Whole-day day-of-year for a Date in local time. */
export function computeDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

/** Fractional local hours, 0..24. */
export function computeLocalHours(d: Date): number {
  return (
    d.getHours() +
    d.getMinutes() / 60 +
    d.getSeconds() / 3600 +
    d.getMilliseconds() / 3.6e6
  );
}

/**
 * Solar position via the standard NOAA-style low-precision approximation.
 * Inputs: day-of-year, fractional local hours, latitude, longitude (deg).
 * Returns altitude & azimuth in degrees. Timezone is taken from the device,
 * so we estimate the timezone offset from the Date itself.
 */
export function computeSunPosition(
  dayOfYear: number,
  localHours: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetHours: number,
): { altDeg: number; azDeg: number } {
  // Solar declination (deg). Cooper's approximation.
  const decl =
    23.45 * Math.sin(DEG * (360 * (284 + dayOfYear)) / 365);

  // Equation of time (minutes), simple Fourier approximation.
  const b = DEG * ((360 / 364) * (dayOfYear - 81));
  const eot =
    9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // Time correction: longitude vs. timezone standard meridian + EoT.
  const lstm = 15 * tzOffsetHours; // local standard time meridian
  const tc = 4 * (lonDeg - lstm) + eot; // minutes
  const solarTime = localHours + tc / 60;

  // Hour angle (deg): 0 at solar noon, negative morning, positive afternoon.
  const ha = 15 * (solarTime - 12);

  const latR = latDeg * DEG;
  const declR = decl * DEG;
  const haR = ha * DEG;

  const sinAlt =
    Math.sin(latR) * Math.sin(declR) +
    Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
  const altR = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // Azimuth (measured from North, clockwise).
  const cosAz =
    (Math.sin(declR) - Math.sin(altR) * Math.sin(latR)) /
    (Math.cos(altR) * Math.cos(latR) || 1e-6);
  let azR = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  // Before solar noon the sun is in the east; after, in the west.
  if (ha > 0) azR = 2 * Math.PI - azR;

  return { altDeg: altR * RAD, azDeg: azR * RAD };
}

/**
 * Moon synodic phase from a known reference new moon.
 * Reference: 2000-01-06 18:14 UTC new moon. Synodic month = 29.530588853 days.
 */
export function computeMoonPhase(date: Date): { phase: number; illum: number } {
  const refNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodic = 29.530588853;
  const days = (date.getTime() - refNewMoon) / 86400000;
  let phase = (days % synodic) / synodic;
  if (phase < 0) phase += 1;
  // Illuminated fraction: 0 at new, 1 at full (cosine model).
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return { phase, illum };
}

/**
 * Full sky state for a given moment, latitude, longitude.
 * `date` provides wall-clock + timezone; lat/lon may be overridden.
 */
export function computeSkyState(
  date: Date,
  latDeg: number,
  lonDeg: number,
): SkyState {
  const dayOfYear = computeDayOfYear(date);
  const hours = computeLocalHours(date);
  // getTimezoneOffset is minutes WEST of UTC; we want hours EAST.
  const tzOffsetHours = -date.getTimezoneOffset() / 60;
  const { altDeg, azDeg } = computeSunPosition(
    dayOfYear,
    hours,
    latDeg,
    lonDeg,
    tzOffsetHours,
  );
  const { phase, illum } = computeMoonPhase(date);
  // Year fraction roughly anchored so winter solstice (~day 355) is "deep".
  const yearFrac = (dayOfYear % 365) / 365;
  return {
    hours,
    dayOfYear,
    yearFrac,
    sunAltDeg: altDeg,
    sunAzDeg: azDeg,
    moonIllum: illum,
    moonPhase: phase,
    lat: latDeg,
    lon: lonDeg,
  };
}

/** A human-readable name for the moment of day from solar altitude. */
export function moodLabel(s: SkyState): string {
  const a = s.sunAltDeg;
  if (a > 35) return "high noon — bright partials";
  if (a > 8) return "broad day — open major air";
  if (a > -0.5) return "golden hour — warm bloom";
  if (a > -6) return "civil twilight — cluster forming";
  if (a > -12) return "nautical dusk — sinking";
  if (a > -18) return "astronomical dark — cellar drone";
  return "deep night — the low root alone";
}

/** Season label from day-of-year (northern-hemisphere flavored). */
export function seasonLabel(dayOfYear: number): string {
  const d = dayOfYear;
  if (d < 80 || d >= 355) return "winter";
  if (d < 172) return "spring";
  if (d < 266) return "summer";
  return "autumn";
}

/**
 * A continuous "brightness of the year" 0..1 used to color the mode:
 * 0 at winter solstice (~Dec 21), 1 at summer solstice (~Jun 21).
 */
export function seasonBrightness(dayOfYear: number): number {
  // Cosine anchored to summer solstice (~day 172).
  const x = ((dayOfYear - 172) / 365) * 2 * Math.PI;
  return (Math.cos(x) + 1) / 2;
}
