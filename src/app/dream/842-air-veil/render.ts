// Canvas2D world-map + particle-wind veil renderer.

export interface City {
  name: string;
  lat: number;
  lon: number;
}

export interface CityState {
  aqi: number; // US-AQI, animated toward target
  aqiTarget: number;
  pm25: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  brown: number; // 0 grey .. 1 brown, by dirtiness
}

export const CITIES: City[] = [
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "São Paulo", lat: -23.55, lon: -46.63 },
  { name: "Mexico City", lat: 19.43, lon: -99.13 },
];

export function projX(lon: number, w: number): number {
  return ((lon + 180) / 360) * w;
}
export function projY(lat: number, h: number): number {
  return ((90 - lat) / 180) * h;
}

// US-AQI -> 0..1 "dirtiness" (clamped at 200, hazardous-ish).
export function dirtiness(aqi: number): number {
  return Math.max(0, Math.min(1, aqi / 200));
}

export function aqiColor(aqi: number): string {
  if (aqi <= 50) return "#34d399"; // emerald — good
  if (aqi <= 100) return "#fbbf24"; // amber — moderate
  if (aqi <= 150) return "#fb923c"; // orange
  if (aqi <= 200) return "#f87171"; // rose — unhealthy
  return "#e879a9"; // hazardous
}

export function aqiLabel(aqi: number): string {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy (sensitive)";
  if (aqi <= 200) return "unhealthy";
  return "hazardous";
}

// A loose, low-poly continental silhouette drawn as filled blobs.
// Coordinates are lon/lat polygons, kept deliberately simple.
const LANDMASSES: [number, number][][] = [
  // North America
  [
    [-168, 65], [-140, 70], [-95, 70], [-60, 60], [-52, 47], [-70, 42],
    [-81, 25], [-97, 25], [-110, 23], [-125, 40], [-140, 58],
  ],
  // South America
  [
    [-80, 8], [-60, 5], [-50, -5], [-40, -22], [-58, -52], [-72, -40],
    [-78, -10], [-80, 2],
  ],
  // Europe
  [
    [-10, 60], [10, 70], [40, 68], [40, 45], [28, 36], [10, 38],
    [-5, 43], [-10, 50],
  ],
  // Africa
  [
    [-16, 28], [10, 35], [33, 32], [44, 11], [50, -25], [25, -34],
    [12, -16], [8, 4], [-16, 12],
  ],
  // Asia
  [
    [40, 68], [90, 75], [140, 72], [160, 60], [142, 45], [122, 38],
    [120, 22], [98, 8], [78, 8], [60, 24], [45, 40], [40, 55],
  ],
  // Australia
  [
    [114, -22], [130, -12], [145, -16], [153, -28], [140, -38],
    [120, -34], [114, -28],
  ],
];

export function drawMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#0a0d14";
  ctx.fillRect(0, 0, w, h);

  // faint graticule
  ctx.strokeStyle = "rgba(148,163,184,0.06)";
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = projX(lon, w);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = projY(lat, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // continents
  ctx.fillStyle = "rgba(71,85,105,0.30)";
  ctx.strokeStyle = "rgba(148,163,184,0.22)";
  ctx.lineWidth = 1;
  for (const poly of LANDMASSES) {
    ctx.beginPath();
    poly.forEach(([lon, lat], idx) => {
      const x = projX(lon, w);
      const y = projY(lat, h);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

export function drawCity(
  ctx: CanvasRenderingContext2D,
  city: City,
  state: CityState,
  w: number,
  h: number,
) {
  const x = projX(city.lon, w);
  const y = projY(city.lat, h);
  const col = aqiColor(state.aqi);
  const d = dirtiness(state.aqi);

  // glow
  const r = 6 + d * 10;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  grad.addColorStop(0, col);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // core dot
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // label
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(city.name, x + 9, y - 6);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(`AQI ${Math.round(state.aqi)}`, x + 9, y + 9);
}

// Spawn / advance the drifting particle veil for a city.
export function runParticleStep(
  particles: Particle[],
  city: City,
  state: CityState,
  w: number,
  h: number,
) {
  const cx = projX(city.lon, w);
  const cy = projY(city.lat, h);
  const d = dirtiness(state.aqi);

  // soft trickle each frame, capped; probabilistic so the total stays
  // roughly proportional to dirtiness
  let spawn = 3;
  if (Math.random() > d * 0.9 + 0.05) spawn = 0;

  for (let s = 0; s < spawn; s++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * (10 + d * 26);
    particles.push({
      x: cx + Math.cos(ang) * rad,
      y: cy + Math.sin(ang) * rad,
      vx: 0,
      vy: 0,
      life: 1,
      size: 1 + Math.random() * (1.5 + d * 3),
      brown: d,
    });
  }
}

export function advanceParticles(
  particles: Particle[],
  w: number,
  h: number,
  windPhase: number,
) {
  const wind = 0.35 + Math.sin(windPhase) * 0.25;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vx += (wind - p.vx) * 0.05;
    p.vy += (Math.sin(windPhase * 0.7 + p.x * 0.01) * 0.15 - p.vy) * 0.05;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.006;
    if (p.life <= 0 || p.x > w + 20 || p.x < -20) {
      particles.splice(i, 1);
    }
  }
  // hard cap for perf
  if (particles.length > 1400) particles.splice(0, particles.length - 1400);
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
) {
  for (const p of particles) {
    // grey (clean-ish) -> brown (dirty)
    const r = Math.floor(150 + p.brown * 70);
    const g = Math.floor(150 - p.brown * 40);
    const b = Math.floor(150 - p.brown * 80);
    ctx.globalAlpha = p.life * (0.12 + p.brown * 0.28);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
