// City Breath — data layer.
//
// A "city" is a set of bike-share stations, each with a live count of
// free_bikes vs. empty_slots. We poll snapshots and DIFF successive
// snapshots to detect UNDOCK (a bike ridden off) and RETURN events.
//
// Two sources:
//   1. LIVE: the Citybikes aggregator (CORS-open, no-auth) which wraps the
//      GBFS open-mobility standard. https://api.citybik.es/v2/networks/<id>
//   2. SIMULATED: a fully deterministic synthetic city (mulberry32 seed
//      0x1806) plus a seeded "day" simulator, so the piece breathes with
//      ZERO network. All randomness here is seeded — no Math.random,
//      no Date.now, no performance.now on the value path.

export type Station = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  free: number; // free_bikes currently docked
  // normalized plot position in [0,1], filled by projectStations()
  x: number;
  y: number;
};

export type Snapshot = {
  stations: Station[];
  /** unix ms of the feed's own timestamp, for display only (never animation) */
  updatedAt: number | null;
};

export type FluxEvent = {
  stationIndex: number;
  kind: "undock" | "return";
  magnitude: number; // how many bikes moved at this station this diff
  x: number;
  y: number;
  lon: number;
  lat: number;
};

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32, seed 0x1806.
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY_SEED = 0x1806;

// Default live network: a big, tidal system.
export const DEFAULT_NETWORK = "citi-bike-nyc";
export const CITYBIKES_BASE = "https://api.citybik.es/v2";

// ---------------------------------------------------------------------------
// Synthetic city — ~120 stations with plausible NYC-ish geography.
// ---------------------------------------------------------------------------
const SYNTH_COUNT = 120;
// A rough Manhattan/Brooklyn bounding box.
const LAT_LO = 40.68;
const LAT_HI = 40.8;
const LON_LO = -74.02;
const LON_HI = -73.94;

export function buildSyntheticCity(): Station[] {
  const rnd = mulberry32(CITY_SEED);
  const stations: Station[] = [];
  for (let i = 0; i < SYNTH_COUNT; i++) {
    // Cluster stations loosely toward the center for a city-like density.
    const cx = rnd();
    const cy = rnd();
    const lon = LON_LO + (LON_HI - LON_LO) * (0.15 + 0.7 * cx);
    const lat = LAT_LO + (LAT_HI - LAT_LO) * (0.15 + 0.7 * cy);
    const capacity = 14 + Math.floor(rnd() * 32); // 14..45
    const startFrac = 0.25 + 0.5 * rnd();
    const free = Math.max(0, Math.min(capacity, Math.round(capacity * startFrac)));
    stations.push({
      id: `synth-${i}`,
      name: `Station ${i + 1}`,
      lat,
      lon,
      capacity,
      free,
      x: 0,
      y: 0,
    });
  }
  return stations;
}

// ---------------------------------------------------------------------------
// Seeded "day" simulator.
//
// Advances an integer tick. Each step, a slow tidal target fullness (a sine
// of the tick) pulls the whole city toward empty in the "morning rush" and
// full in the "evening", while individual stations trade bikes stochastically
// (seeded). Returns the mutated station array so the caller can diff it.
// ---------------------------------------------------------------------------
export class DaySimulator {
  private rnd: () => number;
  private tick = 0;
  private stations: Station[];

  constructor(stations: Station[]) {
    this.stations = stations;
    // Independent seeded stream so the walk is reproducible.
    this.rnd = mulberry32((CITY_SEED ^ 0x9e37) >>> 0);
  }

  /** One simulated "poll step": moves a handful of bikes and returns a fresh
   *  free-count array (does not mutate the caller's snapshot in place until
   *  applied). */
  step(): number[] {
    this.tick++;
    // Tidal target: fullness sweeps ~0.30..0.72 over a slow cycle.
    const phase = (this.tick % 240) / 240; // 240 steps per "day"
    const tide = 0.5 + 0.42 * Math.cos(phase * Math.PI * 2); // 0.08..0.92-ish
    const targetFull = 0.3 + 0.42 * tide; // keep it in a musical band

    const counts = this.stations.map((s) => s.free);
    // Number of transactions this step scales gently with a seeded jitter.
    const txns = 6 + Math.floor(this.rnd() * 10);
    for (let t = 0; t < txns; t++) {
      const i = Math.floor(this.rnd() * this.stations.length);
      const s = this.stations[i];
      const localFull = counts[i] / s.capacity;
      // Bias: if the city "wants" to be fuller than this station is, a bike
      // tends to arrive; otherwise one tends to leave. Plus noise.
      const wantReturn = this.rnd() < 0.5 + 0.9 * (targetFull - localFull);
      if (wantReturn && counts[i] < s.capacity) {
        counts[i] = Math.min(s.capacity, counts[i] + 1);
      } else if (!wantReturn && counts[i] > 0) {
        counts[i] = Math.max(0, counts[i] - 1);
      }
    }
    return counts;
  }
}

// ---------------------------------------------------------------------------
// Projection — map lat/lon into a normalized [0,1] box for the SVG viewBox.
// A simple equirectangular fit around the observed bounds, y flipped so north
// is up. Mutates each station's x,y.
// ---------------------------------------------------------------------------
export function projectStations(stations: Station[]): void {
  if (stations.length === 0) return;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const s of stations) {
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
    if (s.lon < minLon) minLon = s.lon;
    if (s.lon > maxLon) maxLon = s.lon;
  }
  const latSpan = maxLat - minLat || 1;
  const lonSpan = maxLon - minLon || 1;
  // Small inset so pulses near the edge stay visible.
  const inset = 0.06;
  for (const s of stations) {
    const nx = (s.lon - minLon) / lonSpan;
    const ny = (s.lat - minLat) / latSpan;
    s.x = inset + (1 - 2 * inset) * nx;
    s.y = inset + (1 - 2 * inset) * (1 - ny); // flip: north up
  }
}

// ---------------------------------------------------------------------------
// Diff two free-count arrays into flux events.
//
// A station whose free count DROPPED = bikes UNDOCKED (ridden off).
// A station whose free count ROSE     = bikes RETURNED.
// Events are ranked by magnitude so the caller can cap per frame and keep the
// biggest movements.
// ---------------------------------------------------------------------------
export function diffCounts(
  stations: Station[],
  prev: number[],
  next: number[],
): FluxEvent[] {
  const events: FluxEvent[] = [];
  for (let i = 0; i < stations.length; i++) {
    const delta = next[i] - prev[i];
    if (delta === 0) continue;
    const s = stations[i];
    events.push({
      stationIndex: i,
      kind: delta < 0 ? "undock" : "return",
      magnitude: Math.abs(delta),
      x: s.x,
      y: s.y,
      lon: s.lon,
      lat: s.lat,
    });
  }
  events.sort((a, b) => b.magnitude - a.magnitude);
  return events;
}

export function systemFullness(stations: Station[]): number {
  let free = 0;
  let cap = 0;
  for (const s of stations) {
    free += s.free;
    cap += s.capacity;
  }
  return cap > 0 ? free / cap : 0;
}

// ---------------------------------------------------------------------------
// Live fetch from Citybikes. Returns a Snapshot or throws.
// Called directly from the client (feed is CORS-open) — no API route.
// ---------------------------------------------------------------------------
type CitybikesStation = {
  id?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  free_bikes?: number | null;
  empty_slots?: number | null;
  timestamp?: string;
};

export async function fetchNetwork(
  networkId: string,
  signal?: AbortSignal,
): Promise<{ name: string; snapshot: Snapshot }> {
  const res = await fetch(`${CITYBIKES_BASE}/networks/${networkId}`, {
    signal,
    // no credentials, plain GET
  });
  if (!res.ok) throw new Error(`citybikes ${res.status}`);
  const json = (await res.json()) as {
    network?: {
      name?: string;
      stations?: CitybikesStation[];
    };
  };
  const net = json.network;
  const raw = net?.stations ?? [];
  if (raw.length === 0) throw new Error("no stations");
  let updatedAt: number | null = null;
  const stations: Station[] = [];
  for (const r of raw) {
    const lat = typeof r.latitude === "number" ? r.latitude : NaN;
    const lon = typeof r.longitude === "number" ? r.longitude : NaN;
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const free = Math.max(0, Math.round(r.free_bikes ?? 0));
    const empty = Math.max(0, Math.round(r.empty_slots ?? 0));
    const capacity = Math.max(1, free + empty);
    if (r.timestamp) {
      const t = Date.parse(r.timestamp); // display only
      if (!isNaN(t)) updatedAt = updatedAt === null ? t : Math.max(updatedAt, t);
    }
    stations.push({
      id: r.id ?? `${lat},${lon}`,
      name: r.name ?? "Station",
      lat,
      lon,
      capacity,
      free,
      x: 0,
      y: 0,
    });
  }
  if (stations.length === 0) throw new Error("no valid stations");
  return {
    name: net?.name ?? networkId,
    snapshot: { stations, updatedAt },
  };
}
