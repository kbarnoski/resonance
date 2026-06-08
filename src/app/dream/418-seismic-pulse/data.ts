// data.ts — USGS earthquake feed fetcher with offline fallback
import type { QuakeFeature } from "./sample";
import { SAMPLE_QUAKES } from "./sample";

export type { QuakeFeature };

export type FeedFilter = "all_day" | "2.5_day" | "significant_day";

const FEED_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/";

export interface FetchResult {
  quakes: QuakeFeature[];
  isLive: boolean;
}

export async function fetchQuakes(filter: FeedFilter = "all_day"): Promise<FetchResult> {
  const url = `${FEED_BASE}${filter}.geojson`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as { features: any[] };
    const quakes: QuakeFeature[] = json.features
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: any) =>
          f?.properties?.time &&
          Array.isArray(f?.geometry?.coordinates) &&
          f.geometry.coordinates.length >= 3
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => ({
        properties: {
          mag: typeof f.properties.mag === "number" ? f.properties.mag : null,
          place: f.properties.place ?? "Unknown location",
          time: f.properties.time,
        },
        geometry: {
          coordinates: [
            f.geometry.coordinates[0],
            f.geometry.coordinates[1],
            f.geometry.coordinates[2] ?? 10,
          ] as [number, number, number],
        },
      }));

    return { quakes, isLive: true };
  } catch {
    clearTimeout(timeout);
    return { quakes: SAMPLE_QUAKES, isLive: false };
  }
}
