// worldmap.ts — hand-authored simplified world coastlines + the equirectangular
// projection that turns geographic [lon, lat] into SVG x/y.
//
// No d3, no topojson, no fetched geometry: the continents below are coarse
// polygons authored by hand (recognizable blobs, deliberately low-poly to suit
// the instrument-panel look). They serve two jobs:
//   1. drawn as SVG <path> fills — the cartographic base map;
//   2. a point-in-polygon LAND test, so the drone can hear the sub-satellite
//      point cross from ocean → land.
//
// Equirectangular (plate carrée) projection — the oldest and simplest map
// projection (Marinus of Tyre, ~100 CE): longitude and latitude map linearly to
// x and y. See README for the citation.

/** Projection canvas, 2:1 like every equirectangular world map. */
export const MAP_W = 720;
export const MAP_H = 360;

/** [lon, lat] → SVG x. lon −180..180 → 0..720. */
export function lonToX(lon: number): number {
  return (lon + 180) * (MAP_W / 360);
}

/** [lon, lat] → SVG y. lat 90..−90 → 0..360 (north up). */
export function latToY(lat: number): number {
  return (90 - lat) * (MAP_H / 180);
}

type Ring = ReadonlyArray<readonly [number, number]>; // [lon, lat]

// ── Continent rings (coarse, hand-authored) ─────────────────────────────────
const NORTH_AMERICA: Ring = [
  [-166, 65], [-158, 71], [-130, 70], [-125, 60], [-130, 55], [-124, 48],
  [-123, 38], [-118, 33], [-110, 23], [-105, 20], [-97, 16], [-92, 15],
  [-88, 21], [-84, 22], [-80, 25], [-81, 31], [-75, 35], [-70, 41],
  [-66, 44], [-60, 46], [-56, 51], [-64, 60], [-78, 62], [-95, 68],
  [-110, 68], [-133, 69], [-155, 71], [-166, 65],
];
const GREENLAND: Ring = [
  [-45, 60], [-42, 65], [-22, 70], [-20, 76], [-30, 82], [-45, 83],
  [-58, 80], [-55, 72], [-50, 66], [-45, 60],
];
const SOUTH_AMERICA: Ring = [
  [-80, 8], [-76, 10], [-70, 11], [-62, 10], [-52, 5], [-50, 0], [-48, -2],
  [-40, -3], [-35, -8], [-38, -13], [-42, -23], [-48, -25], [-53, -34],
  [-58, -38], [-62, -40], [-65, -45], [-68, -50], [-72, -52], [-75, -50],
  [-73, -44], [-72, -35], [-71, -25], [-70, -18], [-75, -14], [-78, -8],
  [-81, -5], [-80, 0], [-78, 5], [-80, 8],
];
const AFRICA: Ring = [
  [-16, 15], [-16, 20], [-10, 28], [0, 32], [10, 34], [20, 32], [25, 32],
  [33, 31], [35, 28], [43, 12], [51, 12], [48, 5], [42, -2], [40, -10],
  [35, -18], [32, -25], [27, -33], [20, -35], [18, -30], [14, -22],
  [12, -16], [9, -1], [9, 4], [5, 5], [-4, 5], [-8, 4], [-13, 8], [-16, 15],
];
const EUROPE: Ring = [
  [-10, 36], [-9, 43], [-2, 43], [-1, 49], [-5, 50], [0, 51], [2, 51],
  [4, 54], [8, 54], [8, 58], [5, 61], [10, 64], [16, 68], [24, 70],
  [30, 68], [28, 60], [30, 56], [27, 54], [24, 50], [26, 46], [28, 45],
  [30, 45], [28, 41], [22, 40], [24, 38], [20, 38], [16, 40], [18, 42],
  [13, 44], [12, 38], [8, 44], [3, 43], [-3, 36], [-10, 36],
];
const ASIA: Ring = [
  [26, 42], [35, 40], [36, 36], [43, 40], [48, 38], [50, 30], [57, 25],
  [60, 25], [66, 25], [68, 24], [73, 20], [77, 8], [80, 10], [80, 16],
  [87, 21], [92, 22], [90, 15], [98, 8], [104, 10], [106, 18], [109, 18],
  [105, 22], [108, 25], [113, 23], [120, 31], [122, 37], [126, 40],
  [129, 43], [135, 48], [142, 54], [135, 55], [140, 60], [150, 60],
  [160, 62], [170, 66], [178, 68], [170, 70], [160, 71], [140, 73],
  [130, 73], [110, 74], [90, 76], [75, 73], [68, 72], [60, 70], [55, 68],
  [48, 66], [40, 66], [33, 66], [30, 62], [36, 56], [40, 48], [30, 45],
  [26, 42],
];
const AUSTRALIA: Ring = [
  [113, -22], [114, -28], [118, -35], [123, -34], [129, -32], [134, -33],
  [138, -35], [141, -38], [147, -38], [150, -37], [153, -31], [153, -25],
  [146, -19], [142, -11], [136, -12], [137, -16], [130, -15], [125, -14],
  [122, -18], [113, -22],
];
const NEW_ZEALAND: Ring = [
  [173, -35], [175, -39], [178, -38], [174, -42], [170, -46], [167, -46],
  [170, -42], [172, -38], [173, -35],
];
const UK: Ring = [
  [-5, 50], [-3, 53], [-3, 58], [-6, 58], [-6, 54], [-5, 50],
];
const JAPAN: Ring = [
  [130, 31], [135, 34], [140, 36], [142, 40], [141, 43], [138, 37],
  [133, 34], [130, 31],
];
const MADAGASCAR: Ring = [
  [44, -12], [50, -15], [50, -20], [46, -25], [44, -22], [43, -16], [44, -12],
];
// Antarctica as a low band hugging the south with a gently wavy coast.
const ANTARCTICA: Ring = [
  [-180, -70], [-140, -73], [-100, -72], [-60, -74], [-20, -70], [20, -69],
  [60, -67], [100, -66], [140, -68], [180, -70], [180, -90], [-180, -90],
  [-180, -70],
];

export const CONTINENTS: ReadonlyArray<Ring> = [
  ANTARCTICA, NORTH_AMERICA, GREENLAND, SOUTH_AMERICA, AFRICA, EUROPE,
  ASIA, AUSTRALIA, NEW_ZEALAND, UK, JAPAN, MADAGASCAR,
];

/** SVG path `d` for one ring, projected to the map canvas. */
export function ringToPath(ring: Ring): string {
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    d += `${i === 0 ? "M" : "L"}${lonToX(lon).toFixed(1)} ${latToY(lat).toFixed(1)} `;
  }
  return d + "Z";
}

/** All continents as one big `d` for a single fill path. */
export const LAND_PATH: string = CONTINENTS.map(ringToPath).join(" ");

/** Even–odd ray-cast point-in-polygon in geographic space. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Is the sub-satellite point over (simplified) land? Drives timbre. */
export function isOverLand(lon: number, lat: number): boolean {
  for (const ring of CONTINENTS) {
    if (inRing(lon, lat, ring)) return true;
  }
  return false;
}

/** Graticule (meridians + parallels) as SVG line coords for the faint grid. */
export function graticule(): {
  meridians: number[];
  parallels: number[];
} {
  const meridians: number[] = [];
  for (let lon = -180; lon <= 180; lon += 30) meridians.push(lonToX(lon));
  const parallels: number[] = [];
  for (let lat = -60; lat <= 60; lat += 30) parallels.push(latToY(lat));
  return { meridians, parallels };
}
