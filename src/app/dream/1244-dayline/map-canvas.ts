// 1244-dayline — Canvas2D renderer.
//
// Pale "printed atlas" look: warm-paper land, slate seas, dark ink coasts and
// labels. The night side is a translucent cool overlay computed from a coarse
// lit/unlit grid; the terminator reads as the boundary, with a luminous band
// (amber on the dawn side, rose on the dusk side). Cities are small ink dots
// that bloom softly when they ring. Retina-aware via devicePixelRatio.

import { CITIES, CONTINENTS } from "./cities";
import { Subsolar, solarAltitudeDeg } from "./astro";

// Printed-atlas palette.
const PAPER = "#f3ecda";
const SEA = "#cdd6da";
const LAND = "#efe6d2";
const COAST = "#8a7f63";
const INK = "#2b2a24";
const NIGHT = "rgba(40, 58, 84, 0.34)";
const DAWN = "255, 179, 92"; // amber
const DUSK = "233, 143, 168"; // rose
const SUN = "#e8a63c";

export interface RenderParams {
  sub: Subsolar;
  dt: number;
}

export class DaylineMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private bloom: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
    this.bloom = new Float32Array(CITIES.length);
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  triggerBloom(index: number): void {
    if (index >= 0 && index < this.bloom.length) this.bloom[index] = 1;
  }

  private lonToX(lon: number): number {
    return ((lon + 180) / 360) * this.mapW + this.mapX;
  }
  private latToY(lat: number): number {
    return ((90 - lat) / 180) * this.mapH + this.mapY;
  }

  // The map is inset to keep a paper margin.
  private get margin(): number {
    return Math.max(16, Math.min(this.w, this.h) * 0.04);
  }
  private get mapX(): number {
    return this.margin;
  }
  private get mapY(): number {
    // Leave headroom for title at top.
    return this.margin + Math.min(120, this.h * 0.12);
  }
  private get mapW(): number {
    return this.w - this.margin * 2;
  }
  private get mapH(): number {
    // Keep 2:1 equirectangular aspect where possible.
    const avail = this.h - this.mapY - this.margin - 40;
    return Math.min(avail, this.mapW / 2);
  }

  render(params: RenderParams): void {
    const { ctx } = this;
    const { sub, dt } = params;

    // Paper background.
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.w, this.h);

    const mx = this.mapX;
    const my = this.mapY;
    const mw = this.mapW;
    const mh = this.mapH;

    // Sea panel.
    ctx.fillStyle = SEA;
    this.drawRoundRect(mx, my, mw, mh, 6);
    ctx.fill();

    // Clip to the map panel for everything inside.
    ctx.save();
    this.drawRoundRect(mx, my, mw, mh, 6);
    ctx.clip();

    // Land fill.
    ctx.fillStyle = LAND;
    ctx.strokeStyle = COAST;
    ctx.lineWidth = 1;
    for (const poly of CONTINENTS) {
      ctx.beginPath();
      poly.forEach(([lon, lat], i) => {
        const x = this.lonToX(lon);
        const y = this.latToY(lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Graticule (faint).
    ctx.strokeStyle = "rgba(43, 42, 36, 0.08)";
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = this.lonToX(lon);
      ctx.beginPath();
      ctx.moveTo(x, my);
      ctx.lineTo(x, my + mh);
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = this.latToY(lat);
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(mx + mw, y);
      ctx.stroke();
    }
    // Equator emphasized.
    ctx.strokeStyle = "rgba(43, 42, 36, 0.16)";
    const yEq = this.latToY(0);
    ctx.beginPath();
    ctx.moveTo(mx, yEq);
    ctx.lineTo(mx + mw, yEq);
    ctx.stroke();

    // Night overlay + terminator band via a coarse lit grid.
    const step = 8;
    for (let py = my; py < my + mh; py += step) {
      const lat = 90 - ((py - my) / mh) * 180;
      for (let px = mx; px < mx + mw; px += step) {
        const lon = ((px - mx) / mw) * 360 - 180;
        const alt = solarAltitudeDeg(lat, lon, sub);
        if (alt < 0) {
          ctx.fillStyle = NIGHT;
          ctx.fillRect(px, py, step, step);
        }
        // Luminous terminator band.
        if (Math.abs(alt) < 4) {
          let dLon = lon - sub.lonDeg;
          dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
          const isDawn = dLon < 0; // west of subsolar = morning
          const a = 0.5 * (1 - Math.abs(alt) / 4);
          ctx.fillStyle = `rgba(${isDawn ? DAWN : DUSK}, ${a.toFixed(3)})`;
          ctx.fillRect(px, py, step, step);
        }
      }
    }

    // Subsolar marker (little sun glyph) if within map.
    const sx = this.lonToX(sub.lonDeg);
    const sy = this.latToY(sub.latDeg);
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26);
    glow.addColorStop(0, "rgba(232, 166, 60, 0.55)");
    glow.addColorStop(1, "rgba(232, 166, 60, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SUN;
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Cities.
    ctx.textBaseline = "middle";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    for (let i = 0; i < CITIES.length; i++) {
      const c = CITIES[i];
      const x = this.lonToX(c.lon);
      const y = this.latToY(c.lat);
      const alt = solarAltitudeDeg(c.lat, c.lon, sub);
      const lit = alt >= 0;

      // Bloom halo.
      const b = this.bloom[i];
      if (b > 0.001) {
        const r = 6 + b * 18;
        let dLon = c.lon - sub.lonDeg;
        dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
        const isDawn = dLon < 0;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(${isDawn ? DAWN : DUSK}, ${(0.5 * b).toFixed(3)})`);
        rg.addColorStop(1, `rgba(${isDawn ? DAWN : DUSK}, 0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Decay.
        this.bloom[i] = Math.max(0, b - dt / 1.4);
      }

      // Dot.
      ctx.fillStyle = lit ? INK : "rgba(43, 42, 36, 0.5)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // remove clip

    // Map frame.
    ctx.strokeStyle = "rgba(43, 42, 36, 0.4)";
    ctx.lineWidth = 1.5;
    this.drawRoundRect(mx, my, mw, mh, 6);
    ctx.stroke();
  }

  private drawRoundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
