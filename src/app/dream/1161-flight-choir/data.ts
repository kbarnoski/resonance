// ── Flight Choir · data layer ────────────────────────────────────────────────
// Live, keyless, client-side ADS-B fetch with a MANDATORY seamless
// simulated-traffic fallback. No API route, no server, no key.
//
// Units are normalised for the whole pipeline:
//   alt   → metres  (baro altitude)
//   speed → m/s     (ground speed)
//   head  → degrees (true track, 0 = north, clockwise)
//   vrate → m/s     (vertical rate, + = climbing)

export type Aircraft = {
  id: string; // stable identity (icao24 / hex) → one audio voice
  callsign: string;
  lon: number; // -180..180
  lat: number; // -90..90
  alt: number; // metres
  speed: number; // m/s
  heading: number; // degrees
  vrate: number; // m/s
};

export type Preset = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  kind: "point" | "global";
  radiusNm?: number;
};

// Hub presets. "point" hits airplanes.live around a hub; "global" hits the
// OpenSky whole-sky feed. Both are CORS-open + keyless (best effort).
export const PRESETS: Preset[] = [
  { id: "world", label: "whole world", lat: 0, lon: 0, kind: "global" },
  { id: "lhr", label: "LHR · London", lat: 51.47, lon: -0.4543, kind: "point", radiusNm: 250 },
  { id: "jfk", label: "JFK · New York", lat: 40.64, lon: -73.78, kind: "point", radiusNm: 250 },
  { id: "hnd", label: "HND · Tokyo", lat: 35.55, lon: 139.78, kind: "point", radiusNm: 250 },
  { id: "dxb", label: "DXB · Dubai", lat: 25.25, lon: 55.36, kind: "point", radiusNm: 250 },
];

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FTMIN_TO_MS = 0.00508;
const MAX_AIRCRAFT = 260; // bound the render / reconcile work

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── OpenSky global feed ───────────────────────────────────────────────────────
// GET /api/states/all → { states: [ [icao24,callsign,country,tpos,tcon,
//   lon,lat,baro_alt,on_ground,velocity,true_track,vertical_rate, ...] ] }
function parseOpenSky(json: unknown): Aircraft[] {
  const states = (json as { states?: unknown[] })?.states;
  if (!Array.isArray(states)) return [];
  const out: Aircraft[] = [];
  for (const s of states) {
    if (!Array.isArray(s)) continue;
    const onGround = s[8] === true;
    const lon = num(s[5]);
    const lat = num(s[6]);
    if (onGround || lon === null || lat === null) continue;
    const id = typeof s[0] === "string" ? s[0] : `os-${out.length}`;
    const callsign = typeof s[1] === "string" && s[1].trim() ? s[1].trim() : "——————";
    out.push({
      id,
      callsign,
      lon,
      lat,
      alt: num(s[7]) ?? 9000,
      speed: num(s[9]) ?? 220,
      heading: num(s[10]) ?? 0,
      vrate: num(s[11]) ?? 0,
    });
    if (out.length >= MAX_AIRCRAFT) break;
  }
  return out;
}

// ── airplanes.live point feed ─────────────────────────────────────────────────
// GET /v2/point/{lat}/{lon}/{radius} → { ac: [ { hex, flight, lat, lon,
//   alt_baro(ft|"ground"), gs(kt), track(deg), baro_rate(ft/min) } ] }
type AcRow = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
  baro_rate?: number;
};

function parseAirplanesLive(json: unknown): Aircraft[] {
  const ac = (json as { ac?: unknown[] })?.ac;
  if (!Array.isArray(ac)) return [];
  const out: Aircraft[] = [];
  for (const raw of ac as AcRow[]) {
    const lon = num(raw.lon);
    const lat = num(raw.lat);
    if (lon === null || lat === null) continue;
    const altFt = typeof raw.alt_baro === "number" ? raw.alt_baro : null;
    if (altFt === null) continue; // skip "ground"
    out.push({
      id: raw.hex ?? `al-${out.length}`,
      callsign: raw.flight?.trim() || "——————",
      lon,
      lat,
      alt: altFt * FT_TO_M,
      speed: (num(raw.gs) ?? 260) * KT_TO_MS,
      heading: num(raw.track) ?? 0,
      vrate: (num(raw.baro_rate) ?? 0) * FTMIN_TO_MS,
    });
    if (out.length >= MAX_AIRCRAFT) break;
  }
  return out;
}

/** Fetch a live snapshot. Throws on any failure so the caller can fall back. */
export async function fetchLive(preset: Preset, signal: AbortSignal): Promise<Aircraft[]> {
  const url =
    preset.kind === "global"
      ? "https://opensky-network.org/api/states/all"
      : `https://api.airplanes.live/v2/point/${preset.lat}/${preset.lon}/${preset.radiusNm ?? 250}`;
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${preset.kind} feed HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  const list = preset.kind === "global" ? parseOpenSky(json) : parseAirplanesLive(json);
  if (list.length === 0) throw new Error("feed returned no aircraft");
  return list;
}

// ── Deterministic PRNG (mulberry32) — never Math.random in hot paths ──────────
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

// ── Simulated sky ─────────────────────────────────────────────────────────────
// A plausible global traffic field: aircraft cluster on busy corridors but
// spread worldwide, each on its own great-circle heading. Runs the IDENTICAL
// sonification pipeline as the live feed, so the piece fully demos offline.

// Rough busy-airspace anchors (lon, lat) to seed clusters around.
const CORRIDORS: Array<[number, number]> = [
  [-0.45, 51.5], // Europe
  [8, 49],
  [-73.8, 40.6], // US east
  [-118, 34], // US west
  [139.8, 35.6], // Japan
  [116, 32], // China
  [55, 25], // Gulf
  [103, 1.3], // SE Asia
  [151, -33.9], // Australia
  [-46, -23.5], // S America
];

export function createSimField(seed: number, count = 64): Aircraft[] {
  const rnd = mulberry32(seed);
  const list: Aircraft[] = [];
  for (let i = 0; i < count; i++) {
    // 70% clustered on a corridor, 30% scattered across the globe.
    let lon: number;
    let lat: number;
    if (rnd() < 0.7) {
      const [cl, cy] = CORRIDORS[Math.floor(rnd() * CORRIDORS.length)];
      lon = cl + (rnd() - 0.5) * 34;
      lat = cy + (rnd() - 0.5) * 22;
    } else {
      lon = (rnd() - 0.5) * 360;
      lat = (rnd() - 0.5) * 130;
    }
    lat = Math.max(-78, Math.min(78, lat));
    list.push({
      id: `sim-${i}`,
      callsign: simCallsign(rnd),
      lon: wrapLon(lon),
      lat,
      alt: 2400 + rnd() * 10600, // ~8k–43k ft
      speed: 180 + rnd() * 90, // ~350–520 kt
      heading: rnd() * 360,
      vrate: (rnd() - 0.5) * 6,
    });
  }
  return list;
}

const AIRLINES = ["BAW", "UAL", "DLH", "JAL", "UAE", "AAL", "SIA", "QFA", "AFR", "KLM", "ANA", "CPA"];
function simCallsign(rnd: () => number): string {
  const a = AIRLINES[Math.floor(rnd() * AIRLINES.length)];
  const n = 10 + Math.floor(rnd() * 989);
  return `${a}${n}`;
}

function wrapLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/** Advance one aircraft along its heading by dt seconds (flat-earth dead
 *  reckoning — accurate enough for smooth on-map motion). Wraps longitude,
 *  reflects at the poles. Mutates in place. */
export function deadReckon(a: Aircraft, dt: number): void {
  const latRad = (a.lat * Math.PI) / 180;
  const hdRad = (a.heading * Math.PI) / 180;
  const dNorth = (a.speed * dt) / 111320; // deg latitude
  const cosLat = Math.max(0.15, Math.cos(latRad));
  const dEast = (a.speed * dt) / (111320 * cosLat); // deg longitude
  a.lat += dNorth * Math.cos(hdRad);
  a.lon = wrapLon(a.lon + dEast * Math.sin(hdRad));
  if (a.lat > 80) {
    a.lat = 80;
    a.heading = 180 - a.heading;
  } else if (a.lat < -80) {
    a.lat = -80;
    a.heading = 180 - a.heading;
  }
}

/** Slow drift of the simulated field — gentle heading/altitude wander so the
 *  sim feels alive over minutes. Deterministic (seeded rnd passed in). */
export function simDrift(list: Aircraft[], rnd: () => number): void {
  for (const a of list) {
    a.heading = (a.heading + (rnd() - 0.5) * 6 + 360) % 360;
    a.alt = Math.max(2000, Math.min(13000, a.alt + (rnd() - 0.5) * 220));
    a.vrate = a.vrate * 0.85 + (rnd() - 0.5) * 1.6;
  }
}
