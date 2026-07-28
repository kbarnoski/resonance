// ════════════════════════════════════════════════════════════════════════════
// Seismic Bell-Choir (3224) — BAKED SNAPSHOT DATASET
//
// A real, hand-written snapshot of ~52 earthquakes modeled on a plausible
// 24-hour window of global seismicity (values drawn from the shape of the USGS
// all_day feed — Pacific Ring of Fire dense, mid-ocean ridges present, a few
// intraplate events). This is the GUARANTEED, network-free demo: the piece is
// fully playable and byte-reproducible from this file alone.
//
// `time` is the offset in milliseconds into a 24-hour clock window [0, 86_400_000)
// — i.e. "when in the UTC day" the quake happened. Live USGS quakes are merged
// onto the same clock via (properties.time % 86_400_000).
// ════════════════════════════════════════════════════════════════════════════

export const DAY_MS = 86_400_000;

export interface Quake {
  id: string;
  /** ms offset into the 24h clock window [0, DAY_MS) */
  time: number;
  /** degrees, -90 (S) .. +90 (N) */
  lat: number;
  /** degrees, -180 (W) .. +180 (E) */
  lon: number;
  /** hypocentre depth in km, 0 (surface) .. ~700 (deep subduction) */
  depthKm: number;
  /** moment magnitude */
  mag: number;
  /** short human region label */
  region: string;
  /** true for baked snapshot rows; false for merged-in live rows */
  baked: boolean;
}

// helper: HH:MM(:SS) → ms of day
function t(h: number, m: number, s = 0): number {
  return ((h * 60 + m) * 60 + s) * 1000;
}

export const SNAPSHOT: Quake[] = [
  // ── Pacific Ring of Fire — western arc (dense) ──────────────────────────────
  { id: "sn-01", time: t(0, 12), lat: 38.3, lon: 142.4, depthKm: 32, mag: 4.6, region: "off Honshu, Japan", baked: true },
  { id: "sn-02", time: t(0, 47), lat: 43.1, lon: 146.9, depthKm: 58, mag: 3.9, region: "Hokkaido, Japan", baked: true },
  { id: "sn-03", time: t(1, 9), lat: 46.4, lon: 152.1, depthKm: 41, mag: 5.2, region: "Kuril Islands", baked: true },
  { id: "sn-04", time: t(1, 38), lat: 54.2, lon: 161.7, depthKm: 88, mag: 4.4, region: "Kamchatka, Russia", baked: true },
  { id: "sn-05", time: t(2, 3), lat: 24.1, lon: 121.9, depthKm: 18, mag: 5.5, region: "Taiwan", baked: true },
  { id: "sn-06", time: t(2, 31), lat: 26.3, lon: 128.2, depthKm: 44, mag: 3.7, region: "Ryukyu Islands", baked: true },
  { id: "sn-07", time: t(3, 4), lat: 16.1, lon: 120.6, depthKm: 27, mag: 4.9, region: "Luzon, Philippines", baked: true },
  { id: "sn-08", time: t(3, 42), lat: 7.2, lon: 126.4, depthKm: 63, mag: 5.8, region: "Mindanao, Philippines", baked: true },
  { id: "sn-09", time: t(4, 15), lat: -1.1, lon: 122.4, depthKm: 21, mag: 4.2, region: "Sulawesi, Indonesia", baked: true },
  { id: "sn-10", time: t(4, 51), lat: -6.3, lon: 130.1, depthKm: 156, mag: 5.1, region: "Banda Sea (deep)", baked: true },
  { id: "sn-11", time: t(5, 19), lat: -8.7, lon: 110.4, depthKm: 34, mag: 4.7, region: "south of Java", baked: true },
  { id: "sn-12", time: t(5, 55), lat: 2.4, lon: 96.1, depthKm: 26, mag: 5.3, region: "off Sumatra", baked: true },

  // ── Ring of Fire — Melanesia / SW Pacific (deep foci common) ─────────────────
  { id: "sn-13", time: t(6, 8), lat: -4.2, lon: 140.6, depthKm: 39, mag: 4.5, region: "New Guinea", baked: true },
  { id: "sn-14", time: t(6, 44), lat: -5.4, lon: 152.3, depthKm: 47, mag: 6.1, region: "New Britain, PNG", baked: true },
  { id: "sn-15", time: t(7, 12), lat: -9.1, lon: 160.7, depthKm: 29, mag: 5.0, region: "Solomon Islands", baked: true },
  { id: "sn-16", time: t(7, 49), lat: -16.4, lon: 168.2, depthKm: 118, mag: 4.8, region: "Vanuatu (deep)", baked: true },
  { id: "sn-17", time: t(8, 21), lat: -17.9, lon: 179.1, depthKm: 552, mag: 5.6, region: "Fiji region (very deep)", baked: true },
  { id: "sn-18", time: t(8, 58), lat: -20.3, lon: -175.2, depthKm: 231, mag: 5.4, region: "Tonga (deep)", baked: true },
  { id: "sn-19", time: t(9, 26), lat: -30.1, lon: -178.4, depthKm: 33, mag: 4.9, region: "Kermadec Islands", baked: true },

  // ── Ring of Fire — Americas (east arc) ──────────────────────────────────────
  { id: "sn-20", time: t(9, 51), lat: 52.1, lon: -175.3, depthKm: 24, mag: 5.2, region: "Andreanof, Aleutians", baked: true },
  { id: "sn-21", time: t(10, 14), lat: 61.2, lon: -147.6, depthKm: 41, mag: 4.3, region: "southern Alaska", baked: true },
  { id: "sn-22", time: t(10, 47), lat: 43.9, lon: -125.4, depthKm: 12, mag: 4.0, region: "off Oregon (Cascadia)", baked: true },
  { id: "sn-23", time: t(11, 8), lat: 19.4, lon: -155.3, depthKm: 6, mag: 3.4, region: "Island of Hawaii", baked: true },
  { id: "sn-24", time: t(11, 39), lat: 16.2, lon: -95.1, depthKm: 43, mag: 5.7, region: "Oaxaca, Mexico", baked: true },
  { id: "sn-25", time: t(12, 6), lat: 13.4, lon: -88.6, depthKm: 61, mag: 4.6, region: "off El Salvador", baked: true },
  { id: "sn-26", time: t(12, 33), lat: 9.1, lon: -84.2, depthKm: 28, mag: 4.1, region: "Costa Rica", baked: true },
  { id: "sn-27", time: t(13, 2), lat: -0.8, lon: -80.4, depthKm: 19, mag: 5.0, region: "near coast of Ecuador", baked: true },
  { id: "sn-28", time: t(13, 41), lat: -14.2, lon: -75.6, depthKm: 47, mag: 5.9, region: "near coast of Peru", baked: true },
  { id: "sn-29", time: t(14, 9), lat: -23.4, lon: -70.1, depthKm: 52, mag: 6.4, region: "Antofagasta, Chile", baked: true },
  { id: "sn-30", time: t(14, 44), lat: -21.2, lon: -63.7, depthKm: 598, mag: 5.5, region: "Bolivia (very deep)", baked: true },
  { id: "sn-31", time: t(15, 12), lat: -33.2, lon: -72.4, depthKm: 26, mag: 4.8, region: "off Valparaíso, Chile", baked: true },
  { id: "sn-32", time: t(15, 48), lat: -38.1, lon: -74.3, depthKm: 31, mag: 5.1, region: "off Araucanía, Chile", baked: true },

  // ── Mid-ocean ridges / transform faults (shallow, oceanic) ──────────────────
  { id: "sn-33", time: t(16, 7), lat: 0.4, lon: -20.6, depthKm: 10, mag: 4.4, region: "Mid-Atlantic Ridge", baked: true },
  { id: "sn-34", time: t(16, 33), lat: -7.9, lon: -13.2, depthKm: 8, mag: 4.7, region: "Ascension transform", baked: true },
  { id: "sn-35", time: t(16, 58), lat: 37.2, lon: -25.1, depthKm: 11, mag: 3.8, region: "Azores region", baked: true },
  { id: "sn-36", time: t(17, 22), lat: -10.4, lon: -110.7, depthKm: 9, mag: 4.9, region: "East Pacific Rise", baked: true },
  { id: "sn-37", time: t(17, 51), lat: 0.9, lon: -104.8, depthKm: 10, mag: 4.2, region: "Galápagos Rise", baked: true },
  { id: "sn-38", time: t(18, 14), lat: 2.1, lon: 66.4, depthKm: 12, mag: 4.6, region: "Carlsberg Ridge", baked: true },
  { id: "sn-39", time: t(18, 46), lat: -30.6, lon: 60.2, depthKm: 9, mag: 4.3, region: "SW Indian Ridge", baked: true },

  // ── Alpine–Himalayan belt ───────────────────────────────────────────────────
  { id: "sn-40", time: t(19, 11), lat: 28.3, lon: 85.1, depthKm: 15, mag: 5.3, region: "Nepal (Himalaya)", baked: true },
  { id: "sn-41", time: t(19, 43), lat: 36.4, lon: 71.2, depthKm: 204, mag: 5.7, region: "Hindu Kush (deep)", baked: true },
  { id: "sn-42", time: t(20, 8), lat: 28.1, lon: 57.4, depthKm: 22, mag: 4.9, region: "southern Iran", baked: true },
  { id: "sn-43", time: t(20, 39), lat: 38.6, lon: 39.2, depthKm: 9, mag: 5.1, region: "eastern Turkey", baked: true },
  { id: "sn-44", time: t(21, 4), lat: 37.1, lon: 22.3, depthKm: 34, mag: 4.5, region: "southern Greece", baked: true },
  { id: "sn-45", time: t(21, 36), lat: 43.2, lon: 13.1, depthKm: 11, mag: 3.9, region: "central Italy (Apennines)", baked: true },
  { id: "sn-46", time: t(22, 2), lat: 64.1, lon: -18.4, depthKm: 7, mag: 3.6, region: "Iceland (Vatnajökull)", baked: true },

  // ── Intraplate / induced (rarer, often shallow) ─────────────────────────────
  { id: "sn-47", time: t(22, 28), lat: 36.2, lon: -89.6, depthKm: 8, mag: 3.2, region: "New Madrid zone, USA", baked: true },
  { id: "sn-48", time: t(22, 54), lat: 36.4, lon: -97.8, depthKm: 5, mag: 3.5, region: "central Oklahoma, USA", baked: true },
  { id: "sn-49", time: t(23, 12), lat: 44.4, lon: -110.6, depthKm: 6, mag: 2.8, region: "Yellowstone, USA", baked: true },

  // ── A few small aftershock-scale ticks to fill the texture ──────────────────
  { id: "sn-50", time: t(23, 27), lat: 38.4, lon: 142.6, depthKm: 30, mag: 3.1, region: "off Honshu (aftershock)", baked: true },
  { id: "sn-51", time: t(23, 41), lat: -23.5, lon: -70.2, depthKm: 48, mag: 3.4, region: "Antofagasta (aftershock)", baked: true },
  { id: "sn-52", time: t(23, 56), lat: 40.1, lon: -124.9, depthKm: 14, mag: 4.1, region: "off Cape Mendocino, USA", baked: true },
];
