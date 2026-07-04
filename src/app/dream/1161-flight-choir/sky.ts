// ── Flight Choir · sky (bright daylight world map) ───────────────────────────
// Canvas2D, equirectangular. Pale-blue oceans, warm-sand continents (coarse
// hand-authored low-poly outlines), a light graticule. High-key + cartographic
// — deliberately the OPPOSITE of the lab's dark cosmic glow. NO WebGL / 3D.

export function project(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

// Coarse continent outlines as [lon, lat] rings. Not GIS-accurate — just
// recognisable silhouettes for a bright backdrop.
const CONTINENTS: Array<Array<[number, number]>> = [
  // North America
  [
    [-168, 65], [-156, 71], [-130, 70], [-100, 73], [-82, 73], [-64, 60],
    [-56, 52], [-53, 47], [-66, 45], [-70, 42], [-74, 40], [-76, 35],
    [-81, 31], [-80, 25], [-83, 29], [-90, 29], [-97, 28], [-97, 22],
    [-105, 20], [-106, 23], [-110, 24], [-113, 30], [-117, 33], [-122, 37],
    [-124, 43], [-124, 48], [-131, 54], [-141, 60], [-153, 59], [-165, 61],
  ],
  // Greenland
  [
    [-45, 60], [-30, 68], [-22, 70], [-20, 76], [-30, 82], [-45, 83],
    [-58, 80], [-55, 72], [-52, 66], [-45, 60],
  ],
  // South America
  [
    [-81, 8], [-77, 8], [-70, 12], [-62, 10], [-52, 5], [-50, 0],
    [-44, -2], [-38, -6], [-35, -8], [-39, -14], [-48, -25], [-53, -34],
    [-58, -39], [-63, -41], [-65, -45], [-69, -52], [-74, -50], [-73, -44],
    [-71, -34], [-71, -24], [-70, -18], [-76, -14], [-81, -6], [-80, -2],
    [-81, 8],
  ],
  // Africa
  [
    [-17, 15], [-16, 21], [-9, 30], [0, 36], [11, 34], [24, 32], [32, 31],
    [35, 24], [43, 12], [51, 12], [43, 4], [41, -3], [40, -12], [35, -18],
    [33, -26], [26, -34], [19, -35], [15, -26], [12, -16], [9, -2],
    [9, 4], [3, 6], [-8, 5], [-13, 8], [-17, 15],
  ],
  // Europe
  [
    [-10, 37], [-9, 43], [-2, 43], [0, 49], [-5, 50], [-3, 54], [2, 51],
    [5, 53], [8, 57], [11, 59], [18, 60], [26, 60], [30, 60], [30, 45],
    [26, 40], [23, 40], [19, 42], [14, 41], [18, 40], [15, 38], [8, 44],
    [3, 43], [-2, 37], [-6, 36], [-10, 37],
  ],
  // Asia
  [
    [30, 60], [40, 66], [55, 68], [70, 72], [90, 75], [110, 73], [140, 72],
    [160, 69], [178, 66], [170, 60], [160, 60], [163, 54], [155, 51],
    [143, 46], [140, 42], [130, 42], [127, 35], [122, 31], [121, 25],
    [110, 21], [106, 10], [104, 1], [100, 6], [98, 12], [93, 16], [90, 22],
    [88, 21], [80, 15], [77, 8], [73, 16], [68, 24], [62, 25], [57, 25],
    [48, 30], [48, 38], [40, 40], [36, 42], [40, 48], [47, 47], [50, 55],
    [40, 55], [35, 55], [30, 55], [30, 60],
  ],
  // India nub already inside Asia; Australia
  [
    [114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -18],
    [150, -24], [153, -28], [151, -34], [146, -38], [140, -38], [135, -35],
    [129, -32], [123, -34], [118, -35], [115, -34], [114, -28], [114, -22],
  ],
];

export type SkyStyle = {
  ocean: string;
  oceanEdge: string;
  land: string;
  landEdge: string;
  grid: string;
};

export const DAYLIGHT: SkyStyle = {
  ocean: "#cfe8f4",
  oceanEdge: "#a9d3e8",
  land: "#efe0bd",
  landEdge: "#cbb789",
  grid: "rgba(90,120,140,0.16)",
};

/** Draw the static bright base map onto a context sized w×h (CSS px). Cheap
 *  enough to blit from an offscreen buffer once per resize. */
export function drawBaseMap(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // ocean — soft vertical daylight gradient (brighter near the equator band)
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#bfe0f0");
  g.addColorStop(0.5, DAYLIGHT.ocean);
  g.addColorStop(1, "#bfe0f0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // graticule every 30°
  ctx.lineWidth = 1;
  ctx.strokeStyle = DAYLIGHT.grid;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = project(lon, 0, w, h);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = project(0, lat, w, h);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // equator a touch stronger
  ctx.strokeStyle = "rgba(90,120,140,0.28)";
  ctx.beginPath();
  const [, ey] = project(0, 0, w, h);
  ctx.moveTo(0, ey);
  ctx.lineTo(w, ey);
  ctx.stroke();

  // continents — warm sand with a soft edge + gentle drop
  ctx.lineJoin = "round";
  for (const ring of CONTINENTS) {
    ctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      const [x, y] = project(lon, lat, w, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = DAYLIGHT.land;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = DAYLIGHT.landEdge;
    ctx.stroke();
  }
}
