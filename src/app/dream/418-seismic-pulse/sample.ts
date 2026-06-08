// Bundled sample data: ~40 realistic earthquakes across the Pacific Ring of Fire
// Used as offline fallback when the USGS live feed is unreachable.
// Times spread across a 24-hour window (0..86400000 ms offsets from a base).

export interface QuakeFeature {
  properties: {
    mag: number | null;
    place: string;
    time: number;
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth_km]
  };
}

const BASE_T = Date.now() - 86_400_000; // 24h ago

function t(offsetHours: number): number {
  return BASE_T + Math.floor(offsetHours * 3_600_000);
}

export const SAMPLE_QUAKES: QuakeFeature[] = [
  // Big Ring-of-Fire events first
  { properties: { mag: 6.4, place: "153km SSE of Perryville, Alaska", time: t(0.3) },  geometry: { coordinates: [-158.2, 54.5, 32] } },
  { properties: { mag: 5.8, place: "Tonga region",                    time: t(1.1) },  geometry: { coordinates: [-175.4, -20.1, 80] } },
  { properties: { mag: 5.5, place: "south of the Kermadec Islands",   time: t(2.4) },  geometry: { coordinates: [-177.9, -32.5, 45] } },
  { properties: { mag: 5.3, place: "Near east coast of Kamchatka",    time: t(3.0) },  geometry: { coordinates: [163.7, 52.8, 70] } },
  { properties: { mag: 5.1, place: "Vanuatu",                         time: t(4.2) },  geometry: { coordinates: [167.8, -15.6, 25] } },
  { properties: { mag: 4.9, place: "Andreanof Islands, Alaska",        time: t(5.3) },  geometry: { coordinates: [-178.3, 51.6, 35] } },
  { properties: { mag: 4.8, place: "Philippines",                     time: t(6.0) },  geometry: { coordinates: [127.3, 7.8, 55] } },
  { properties: { mag: 4.7, place: "Indonesia",                       time: t(6.8) },  geometry: { coordinates: [126.1, -8.4, 90] } },
  { properties: { mag: 4.6, place: "off coast of Central America",    time: t(7.5) },  geometry: { coordinates: [-90.2, 12.3, 30] } },
  { properties: { mag: 4.5, place: "Chile-Argentina border region",   time: t(8.2) },  geometry: { coordinates: [-69.5, -29.8, 110] } },
  { properties: { mag: 4.4, place: "New Zealand",                     time: t(8.9) },  geometry: { coordinates: [177.4, -38.2, 18] } },
  { properties: { mag: 4.3, place: "Java, Indonesia",                 time: t(9.7) },  geometry: { coordinates: [110.5, -7.9, 65] } },
  { properties: { mag: 4.2, place: "Northern Chile",                  time: t(10.4) }, geometry: { coordinates: [-70.1, -22.4, 85] } },
  { properties: { mag: 4.1, place: "Honshu, Japan",                   time: t(11.0) }, geometry: { coordinates: [142.4, 39.7, 40] } },
  { properties: { mag: 4.0, place: "Aleutian Islands, Alaska",        time: t(11.8) }, geometry: { coordinates: [-170.8, 52.1, 28] } },
  // Medium events
  { properties: { mag: 3.8, place: "Southern California",             time: t(12.5) }, geometry: { coordinates: [-117.5, 33.8, 12] } },
  { properties: { mag: 3.7, place: "Kuril Islands",                   time: t(13.1) }, geometry: { coordinates: [148.6, 46.3, 65] } },
  { properties: { mag: 3.6, place: "Peru-Brazil border",              time: t(13.9) }, geometry: { coordinates: [-74.2, -8.7, 170] } },
  { properties: { mag: 3.5, place: "Southern Alaska",                 time: t(14.5) }, geometry: { coordinates: [-148.9, 60.2, 25] } },
  { properties: { mag: 3.4, place: "Colombia",                        time: t(15.2) }, geometry: { coordinates: [-76.5, 4.2, 150] } },
  { properties: { mag: 3.3, place: "Northern Peru",                   time: t(15.9) }, geometry: { coordinates: [-78.3, -5.5, 95] } },
  { properties: { mag: 3.2, place: "Taiwan region",                   time: t(16.4) }, geometry: { coordinates: [121.8, 24.1, 20] } },
  { properties: { mag: 3.1, place: "Nevada",                          time: t(17.0) }, geometry: { coordinates: [-117.2, 38.9, 8] } },
  { properties: { mag: 3.0, place: "Puerto Rico region",              time: t(17.6) }, geometry: { coordinates: [-66.5, 18.2, 10] } },
  { properties: { mag: 2.9, place: "Fiji region",                     time: t(18.1) }, geometry: { coordinates: [-178.4, -17.5, 590] } },
  { properties: { mag: 2.8, place: "Izu Islands, Japan",              time: t(18.7) }, geometry: { coordinates: [139.6, 32.4, 50] } },
  { properties: { mag: 2.7, place: "central Italy",                   time: t(19.3) }, geometry: { coordinates: [13.2, 42.6, 8] } },
  { properties: { mag: 2.6, place: "Hawaii, Hawaii",                  time: t(19.9) }, geometry: { coordinates: [-155.3, 19.5, 5] } },
  { properties: { mag: 2.5, place: "Nevada",                          time: t(20.3) }, geometry: { coordinates: [-114.5, 37.2, 6] } },
  // Small/shallow swarm events
  { properties: { mag: 2.3, place: "Northern California",             time: t(20.8) }, geometry: { coordinates: [-122.8, 40.1, 7] } },
  { properties: { mag: 2.2, place: "New Britain region, PNG",         time: t(21.2) }, geometry: { coordinates: [150.7, -5.9, 35] } },
  { properties: { mag: 2.1, place: "Oregon",                          time: t(21.6) }, geometry: { coordinates: [-122.3, 44.7, 10] } },
  { properties: { mag: 2.0, place: "Alaska Peninsula",                time: t(22.0) }, geometry: { coordinates: [-154.6, 57.3, 15] } },
  { properties: { mag: 1.8, place: "Washington",                      time: t(22.4) }, geometry: { coordinates: [-122.5, 47.2, 14] } },
  { properties: { mag: 1.7, place: "Hawaii, Hawaii",                  time: t(22.7) }, geometry: { coordinates: [-155.1, 19.4, 3] } },
  { properties: { mag: 1.5, place: "Southern California",             time: t(23.0) }, geometry: { coordinates: [-116.8, 33.5, 4] } },
  { properties: { mag: 1.3, place: "Alaska",                          time: t(23.3) }, geometry: { coordinates: [-150.2, 61.5, 18] } },
  { properties: { mag: 1.2, place: "Nevada",                          time: t(23.5) }, geometry: { coordinates: [-117.9, 38.4, 5] } },
  { properties: { mag: 0.9, place: "Northern California",             time: t(23.7) }, geometry: { coordinates: [-121.4, 37.5, 3] } },
  // Deep slab events
  { properties: { mag: 5.2, place: "south of Mariana Islands",        time: t(4.8) },  geometry: { coordinates: [143.9, 12.1, 580] } },
  { properties: { mag: 4.8, place: "Sea of Okhotsk",                  time: t(14.2) }, geometry: { coordinates: [146.3, 52.4, 480] } },
  { properties: { mag: 3.9, place: "Bolivia",                         time: t(9.1) },  geometry: { coordinates: [-67.8, -19.3, 620] } },
];
