/*
 * 877 · BIOSPHERE SCORE — Canvas2D renderer (raw 2D context only)
 *
 * An abstract dark equirectangular world: a glowing lat/lon graticule, faint
 * stylized landmass hints, and a bloom for each observation at its lat/lon
 * (color-coded by section) with an expanding ring and a fading label. A live
 * legend shows active sections, voice counts, and cumulative richness. The
 * aurora-dark palette breathes with the spectrum.
 */

import { SECTIONS, SECTION_ORDER, type SectionId, type ScoreState } from "./structure";

export type Bloom = {
  lon: number;
  lat: number;
  section: SectionId;
  label: string;
  born: number; // ms timestamp (performance.now)
};

// Very coarse landmass hint polygons in lon/lat. Purely decorative.
const LANDMASS: [number, number][][] = [
  // Americas
  [[-130, 60], [-60, 50], [-55, 10], [-80, -55], [-70, -20], [-110, 30]],
  // Africa + Europe
  [[-10, 55], [40, 60], [50, 10], [20, -35], [-15, 10], [-10, 35]],
  // Asia + Australia
  [[60, 65], [140, 55], [150, -10], [115, -40], [90, 5], [70, 30]],
];

function lonLatToXY(lon: number, lat: number, w: number, h: number): [number, number] {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blooms: Bloom[],
  state: ScoreState,
  spectrum: Uint8Array,
  focusedSection: SectionId | null,
  richnessVal: number,
  densityVal: number,
  now: number,
  modeName: string
): void {
  // Background: deep aurora gradient that subtly shifts with richness.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  const topL = 8 + richnessVal * 8;
  bg.addColorStop(0, `rgb(${6}, ${8 + topL}, ${18 + topL * 1.5})`);
  bg.addColorStop(0.55, `rgb(4, 6, 14)`);
  bg.addColorStop(1, `rgb(3, 4, 10)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  drawAurora(ctx, w, h, spectrum, richnessVal, now);
  drawLandmass(ctx, w, h);
  drawGraticule(ctx, w, h, densityVal);
  drawBlooms(ctx, w, h, blooms, focusedSection, now);
  drawLegend(ctx, w, h, state, focusedSection, richnessVal, densityVal, modeName);
}

function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spectrum: Uint8Array,
  richnessVal: number,
  now: number
): void {
  // A few drifting soft glows whose brightness tracks spectral energy.
  let energy = 0;
  for (let i = 0; i < spectrum.length; i++) energy += spectrum[i];
  energy = energy / (spectrum.length * 255); // 0..1
  const t = now / 1000;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const cx = w * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.07 + i * 1.7)));
    const cy = h * (0.25 + 0.4 * (0.5 + 0.5 * Math.cos(t * 0.05 + i * 2.1)));
    const r = (w * 0.28) * (0.7 + 0.3 * Math.sin(t * 0.1 + i));
    const a = (0.05 + energy * 0.16) * (0.5 + richnessVal * 0.6);
    const hue = [180, 270, 200, 300][i % 4];
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `hsla(${hue}, 80%, 60%, ${a})`);
    grad.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawLandmass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(40, 60, 90, 0.12)";
  ctx.strokeStyle = "rgba(90, 130, 180, 0.14)";
  ctx.lineWidth = 1;
  for (const poly of LANDMASS) {
    ctx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const [x, y] = lonLatToXY(lon, lat, w, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  densityVal: number
): void {
  ctx.save();
  const glow = 0.06 + densityVal * 0.1;
  ctx.strokeStyle = `rgba(120, 180, 230, ${glow})`;
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = lonLatToXY(lon, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const [, y] = lonLatToXY(0, lat, w, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Equator a touch brighter.
  ctx.strokeStyle = `rgba(150, 210, 240, ${glow + 0.08})`;
  const [, eqY] = lonLatToXY(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(0, eqY);
  ctx.lineTo(w, eqY);
  ctx.stroke();
  ctx.restore();
}

const BLOOM_LIFE = 4200; // ms

function drawBlooms(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blooms: Bloom[],
  focusedSection: SectionId | null,
  now: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of blooms) {
    const age = (now - b.born) / BLOOM_LIFE;
    if (age >= 1 || age < 0) continue;
    const [x, y] = lonLatToXY(b.lon, b.lat, w, h);
    const [r, g, bl] = SECTIONS[b.section].color;
    const dim = focusedSection && focusedSection !== b.section ? 0.28 : 1;
    const fade = 1 - age;

    // Expanding ring.
    const ringR = 6 + age * 46;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${0.5 * fade * dim})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Core glow.
    const coreR = 10 + (1 - age) * 6;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, coreR);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${0.95 * fade * dim})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Label fades faster than the bloom.
    if (age < 0.55) {
      const la = (1 - age / 0.55) * dim;
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * la})`;
      ctx.fillText(b.label, x + coreR + 4, y + 3);
      ctx.globalCompositeOperation = "lighter";
    }
  }
  ctx.restore();
}

export function pruneBlooms(blooms: Bloom[], now: number): Bloom[] {
  return blooms.filter((b) => now - b.born < BLOOM_LIFE);
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: ScoreState,
  focusedSection: SectionId | null,
  richnessVal: number,
  densityVal: number,
  modeName: string
): void {
  const active = SECTION_ORDER.filter((id) => state.voiceCounts[id] > 0);
  const pad = 14;
  const lineH = 19;
  const boxW = 232;
  const boxH = 70 + Math.max(active.length, 1) * lineH;
  const x0 = pad;
  const y0 = h - boxH - pad;

  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 18, 0.62)";
  ctx.strokeStyle = "rgba(120, 150, 200, 0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, x0, y0, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  let y = y0 + 22;
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillText(`mode ${modeName}`, x0 + 14, y);
  ctx.fillStyle = "rgba(190, 200, 230, 0.8)";
  ctx.fillText(
    `richness ${state.seenSections.size}/${SECTION_ORDER.length}`,
    x0 + 14,
    y + lineH
  );
  ctx.fillText(`events ${state.totalEvents}`, x0 + 130, y + lineH);

  y = y0 + 64;
  for (const id of active) {
    const s = SECTIONS[id];
    const [r, g, bl] = s.color;
    const dim = focusedSection && focusedSection !== id ? 0.4 : 1;
    ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${0.9 * dim})`;
    ctx.beginPath();
    ctx.arc(x0 + 20, y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(235, 240, 250, ${0.85 * dim})`;
    ctx.fillText(s.label, x0 + 32, y);
    ctx.fillStyle = `rgba(180, 190, 220, ${0.75 * dim})`;
    ctx.fillText(`${state.voiceCounts[id]}`, x0 + boxW - 30, y);
    y += lineH;
  }

  // Density bar.
  const barW = boxW - 28;
  const bx = x0 + 14;
  const by = y0 + boxH - 14;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, bx, by, barW, 4, 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${120 + densityVal * 135}, 210, 255, 0.8)`;
  roundRect(ctx, bx, by, barW * Math.max(0.02, densityVal), 4, 2);
  ctx.fill();
  // touch richness so the arc visibly tints the bar baseline
  ctx.fillStyle = `rgba(180, 150, 255, ${0.1 + richnessVal * 0.15})`;
  roundRect(ctx, bx, by, barW, 4, 2);
  ctx.fill();

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Hit-test the legend for section soloing. Returns the section under (px,py). */
export function legendHit(
  w: number,
  h: number,
  state: ScoreState,
  px: number,
  py: number
): SectionId | null {
  const active = SECTION_ORDER.filter((id) => state.voiceCounts[id] > 0);
  const pad = 14;
  const lineH = 19;
  const boxW = 232;
  const boxH = 70 + Math.max(active.length, 1) * lineH;
  const x0 = pad;
  const y0 = h - boxH - pad;
  if (px < x0 || px > x0 + boxW) return null;
  let y = y0 + 64;
  for (const id of active) {
    if (py >= y - 14 && py <= y + 4) return id;
    y += lineH;
  }
  return null;
}
