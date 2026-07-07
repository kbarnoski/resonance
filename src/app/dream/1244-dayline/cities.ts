// 1244-dayline — geography.
//
// ~44 world cities (good global spread, latitude range roughly -55°..+64°) and
// a set of COARSE hand-authored continent outline polygons. The polygons are
// intentionally rough — a dozen-or-so vertices each — used only for the pale
// "printed atlas" landmass fill and the sunlit-land estimate. They are NOT
// accurate coastlines. (Documented in README.md.)

export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "Sydney", lat: -33.87, lon: 151.21 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  { name: "Lagos", lat: 6.52, lon: 3.38 },
  { name: "Nairobi", lat: -1.29, lon: 36.82 },
  { name: "Moscow", lat: 55.75, lon: 37.62 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "Paris", lat: 48.86, lon: 2.35 },
  { name: "Berlin", lat: 52.52, lon: 13.4 },
  { name: "Reykjavík", lat: 64.15, lon: -21.94 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Chicago", lat: 41.88, lon: -87.63 },
  { name: "Mexico City", lat: 19.43, lon: -99.13 },
  { name: "Bogotá", lat: 4.71, lon: -74.07 },
  { name: "Lima", lat: -12.05, lon: -77.04 },
  { name: "Santiago", lat: -33.45, lon: -70.67 },
  { name: "São Paulo", lat: -23.55, lon: -46.63 },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38 },
  { name: "Los Angeles", lat: 34.05, lon: -118.24 },
  { name: "Anchorage", lat: 61.22, lon: -149.9 },
  { name: "Honolulu", lat: 21.31, lon: -157.86 },
  { name: "Auckland", lat: -36.85, lon: 174.76 },
  { name: "Jakarta", lat: -6.21, lon: 106.85 },
  { name: "Beijing", lat: 39.9, lon: 116.4 },
  { name: "Seoul", lat: 37.57, lon: 126.98 },
  { name: "Bangkok", lat: 13.76, lon: 100.5 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Tehran", lat: 35.69, lon: 51.39 },
  { name: "Istanbul", lat: 41.01, lon: 28.98 },
  { name: "Cape Town", lat: -33.92, lon: 18.42 },
  { name: "Casablanca", lat: 33.57, lon: -7.59 },
  { name: "Dakar", lat: 14.72, lon: -17.47 },
  { name: "Toronto", lat: 43.65, lon: -79.38 },
  { name: "Vancouver", lat: 49.28, lon: -123.12 },
  { name: "Helsinki", lat: 60.17, lon: 24.94 },
  { name: "Athens", lat: 37.98, lon: 23.73 },
  { name: "Dubai", lat: 25.2, lon: 55.27 },
  { name: "Perth", lat: -31.95, lon: 115.86 },
  { name: "Vladivostok", lat: 43.12, lon: 131.89 },
  { name: "Ushuaia", lat: -54.8, lon: -68.3 },
  { name: "Nuuk", lat: 64.18, lon: -51.69 },
  { name: "Johannesburg", lat: -26.2, lon: 28.05 },
  { name: "Kinshasa", lat: -4.44, lon: 15.27 },
];

// Coarse continent polygons in [lon, lat] degrees. Rough silhouettes only.
export type Polygon = [number, number][];

export const CONTINENTS: Polygon[] = [
  // North America
  [
    [-168, 65],
    [-140, 70],
    [-95, 72],
    [-60, 60],
    [-52, 47],
    [-70, 42],
    [-80, 25],
    [-97, 25],
    [-107, 23],
    [-117, 32],
    [-125, 40],
    [-130, 55],
    [-168, 65],
  ],
  // Greenland
  [
    [-45, 60],
    [-30, 68],
    [-20, 76],
    [-40, 83],
    [-58, 78],
    [-53, 68],
    [-45, 60],
  ],
  // South America
  [
    [-81, 0],
    [-78, -5],
    [-70, -18],
    [-72, -50],
    [-68, -55],
    [-58, -35],
    [-48, -25],
    [-35, -8],
    [-50, 0],
    [-60, 8],
    [-78, 8],
    [-81, 0],
  ],
  // Africa
  [
    [-17, 15],
    [-10, 5],
    [8, 4],
    [10, -1],
    [13, -8],
    [12, -17],
    [15, -28],
    [20, -35],
    [33, -26],
    [40, -15],
    [51, 12],
    [43, 12],
    [33, 30],
    [10, 34],
    [-6, 36],
    [-17, 21],
    [-17, 15],
  ],
  // Europe
  [
    [-10, 43],
    [-5, 36],
    [3, 43],
    [18, 40],
    [28, 41],
    [30, 45],
    [30, 60],
    [25, 70],
    [5, 62],
    [-5, 58],
    [-10, 51],
    [-9, 43],
  ],
  // Asia
  [
    [30, 60],
    [60, 68],
    [100, 75],
    [140, 72],
    [170, 66],
    [160, 60],
    [140, 45],
    [130, 35],
    [122, 30],
    [108, 20],
    [95, 15],
    [98, 8],
    [80, 8],
    [72, 20],
    [60, 25],
    [50, 28],
    [44, 40],
    [35, 37],
    [30, 45],
    [40, 55],
    [30, 60],
  ],
  // Australia
  [
    [114, -22],
    [122, -18],
    [130, -12],
    [142, -11],
    [146, -19],
    [153, -28],
    [150, -37],
    [141, -38],
    [129, -32],
    [115, -34],
    [114, -22],
  ],
];

/** Ray-cast point-in-polygon test in [lon, lat] space. */
export function pointInPolygon(lon: number, lat: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if a lon/lat falls inside any continent polygon. */
export function isLand(lon: number, lat: number): boolean {
  for (const poly of CONTINENTS) {
    if (pointInPolygon(lon, lat, poly)) return true;
  }
  return false;
}
