// Data layer for 337-seismic-globe.
// Fetches the USGS earthquake GeoJSON feed (public, no key, CORS-open) and
// normalizes features into a compact Quake shape. Falls back to bundled
// sample quakes when the network is blocked so the piece always surrounds you.

export interface Quake {
  id: string
  mag: number
  lon: number
  lat: number
  depthKm: number
  place: string
  time: number
}

export type FeedId = "2.5_day" | "all_day" | "all_hour"

export const FEEDS: { id: FeedId; label: string }[] = [
  { id: "2.5_day", label: "M2.5+ · past day" },
  { id: "all_day", label: "all · past day" },
  { id: "all_hour", label: "all · past hour" },
]

export interface FetchResult {
  quakes: Quake[]
  source: "live" | "sample"
}

const FEED_URL = (feed: FeedId) =>
  `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`

// Globe-spanning fallback so the spatial chord still surrounds the listener
// even when the live fetch is blocked by the review device.
export const SAMPLE_QUAKES: Quake[] = [
  { id: "s1", mag: 6.4, lon: 142.4, lat: 38.3, depthKm: 24, place: "off Honshu, Japan", time: Date.now() - 6e5 },
  { id: "s2", mag: 5.1, lon: -122.8, lat: 38.8, depthKm: 8, place: "Northern California", time: Date.now() - 12e5 },
  { id: "s3", mag: 4.7, lon: -70.7, lat: -33.5, depthKm: 95, place: "central Chile", time: Date.now() - 18e5 },
  { id: "s4", mag: 5.6, lon: 95.3, lat: 1.9, depthKm: 30, place: "northern Sumatra", time: Date.now() - 9e5 },
  { id: "s5", mag: 3.9, lon: 25.7, lat: 39.2, depthKm: 12, place: "Aegean Sea", time: Date.now() - 3e5 },
  { id: "s6", mag: 4.3, lon: -176.5, lat: -19.4, depthKm: 210, place: "Tonga region", time: Date.now() - 15e5 },
  { id: "s7", mag: 5.0, lon: 69.3, lat: 36.5, depthKm: 180, place: "Hindu Kush, Afghanistan", time: Date.now() - 21e5 },
  { id: "s8", mag: 4.5, lon: -157.0, lat: 19.4, depthKm: 5, place: "Island of Hawaii", time: Date.now() - 4e5 },
]

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n)
}

export async function fetchQuakes(feed: FeedId, signal?: AbortSignal): Promise<FetchResult> {
  try {
    const res = await fetch(FEED_URL(feed), { signal, cache: "no-store" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as {
      features?: Array<{
        id?: string
        properties?: { mag?: number | null; place?: string | null; time?: number | null }
        geometry?: { coordinates?: number[] }
      }>
    }
    const features = json.features ?? []
    const quakes: Quake[] = []
    for (const f of features) {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 3) continue
      const [lon, lat, depthKm] = coords
      const mag = f.properties?.mag
      if (!isFiniteNum(lon) || !isFiniteNum(lat) || !isFiniteNum(mag)) continue
      quakes.push({
        id: f.id ?? `${lon},${lat},${f.properties?.time ?? 0}`,
        mag,
        lon,
        lat,
        depthKm: isFiniteNum(depthKm) ? depthKm : 10,
        place: f.properties?.place ?? "unknown region",
        time: isFiniteNum(f.properties?.time) ? (f.properties!.time as number) : Date.now(),
      })
    }
    if (quakes.length === 0) {
      return { quakes: SAMPLE_QUAKES, source: "sample" }
    }
    return { quakes, source: "live" }
  } catch {
    return { quakes: SAMPLE_QUAKES, source: "sample" }
  }
}

// Cap to the loudest N quakes (by magnitude) to keep voice + point counts light.
export function topByMagnitude(quakes: Quake[], n: number): Quake[] {
  return [...quakes].sort((a, b) => b.mag - a.mag).slice(0, n)
}
