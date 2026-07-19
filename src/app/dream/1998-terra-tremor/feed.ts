// ─────────────────────────────────────────────────────────────────────────────
// feed.ts — the Earth's own score.
//
// Pulls every earthquake worldwide in the last 24h from the USGS real-time feed
// (CORS-open, no key). On ANY failure — offline, CORS, empty, malformed — we fall
// back to a SYNTHETIC Poisson quake generator whose magnitudes follow a
// Gutenberg–Richter-ish exponential law, so the piece ALWAYS demos with sound and
// motion. The page only has to ask "did this come back LIVE or SIMULATED?".
// ─────────────────────────────────────────────────────────────────────────────

export interface Quake {
  id: string;
  mag: number; // magnitude (can be negative or ~0 for tiny events)
  place: string; // human-readable region
  time: number; // ms epoch
  lon: number; // −180..180
  lat: number; // −90..90
  depth: number; // km
}

export type FeedStatus = "live" | "simulated";

const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

// ── LIVE fetch ──────────────────────────────────────────────────────────────
export async function fetchQuakes(): Promise<Quake[]> {
  const res = await fetch(FEED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  const feats = (data as { features?: unknown }).features;
  if (!Array.isArray(feats) || feats.length === 0) throw new Error("empty feed");

  const out: Quake[] = [];
  for (const raw of feats) {
    const f = raw as {
      id?: unknown;
      properties?: { mag?: unknown; place?: unknown; time?: unknown };
      geometry?: { coordinates?: unknown };
    };
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const p = f.properties ?? {};
    const mag = typeof p.mag === "number" ? p.mag : 0;
    out.push({
      id: String(f.id ?? `${String(p.time)}-${lon}-${lat}`),
      mag,
      place: typeof p.place === "string" && p.place ? p.place : "unknown region",
      time: typeof p.time === "number" ? p.time : Date.now(),
      lon,
      lat,
      depth: typeof coords[2] === "number" ? coords[2] : 10,
    });
  }
  if (out.length === 0) throw new Error("no usable features");
  out.sort((a, b) => a.time - b.time);
  return out;
}

// ── SYNTHETIC fallback (seeded, so a demo is reproducible) ───────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let synthState = 0x7e44a1;
const REGIONS = [
  "off the coast of Honshu",
  "the Aleutian arc",
  "central Chile",
  "the Kermadec Trench",
  "Sumatra",
  "the San Andreas system",
  "the Hindu Kush",
  "the Mid-Atlantic Ridge",
  "the Kuril Islands",
  "southern Iceland",
];

// Gutenberg–Richter: N(≥M) ∝ 10^(−bM). Inverting the CDF with a uniform draw
// gives an exponential tail — lots of small events, the rare violent one.
function grMagnitude(u: number, mMin = 0.6, b = 1): number {
  const m = mMin - Math.log10(Math.max(u, 1e-9)) / b;
  return Math.min(m, 7.4);
}

/** A plausible batch of quakes "in the last `spanMs`". Larger batches for the
 *  initial day-replay, small trickles for subsequent polls. */
export function makeSyntheticQuakes(count: number, spanMs: number): Quake[] {
  const rng = mulberry32(synthState);
  synthState = (synthState * 1664525 + 1013904223) >>> 0;
  const now = Date.now();
  const out: Quake[] = [];
  for (let i = 0; i < count; i++) {
    const mag = Math.round(grMagnitude(rng()) * 10) / 10;
    // Depth: exponential, most events shallow (<70km), a long tail to ~650km.
    const depth = Math.min(650, -Math.log(Math.max(rng(), 1e-9)) * 34);
    out.push({
      id: `synth-${synthState}-${i}`,
      mag,
      place: `near ${REGIONS[Math.floor(rng() * REGIONS.length)]}`,
      time: now - Math.floor(rng() * spanMs),
      lon: rng() * 360 - 180,
      lat: rng() * 150 - 75,
      depth,
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}
