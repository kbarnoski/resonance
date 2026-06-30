// render.ts — Canvas2D mesh draw for the skin membrane (no React).
//
// We draw the lattice as a shaded wire mesh whose colour tracks local areal
// strain: slack → deep indigo, taut → iridescent magenta→gold. Tension lines
// glow additively (globalCompositeOperation "lighter"). Torn springs leave hot
// rupture rims. The pinned boundary frame is drawn as a faint ring. Every frame
// a semi-transparent wash (never pure black) leaves breathing trails.
//
// A subtle pseudo-3D tilt maps grid (x,y) + transverse z to screen so pressing
// the skin reads as depth. Colour comes from the salvia membrane-reality
// palette: deep indigo slack, hot magenta/gold taut, rupture rims near-white.

import { GRID, Membrane } from "./membrane";

export interface RenderDrivers {
  tension: number;
  brightness: number;
}

// HSL → CSS, small helper (kept non-React-named).
function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a})`;
}

export class MembraneRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("Canvas2D unavailable");
    this.ctx = c;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.w = cssW;
    this.h = cssH;
    const canvas = this.ctx.canvas;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Map a grid cell + its z displacement to screen coords. We centre the mesh
  // and apply a gentle vertical tilt so transverse motion reads as depth.
  private project(gx: number, gy: number, z: number): [number, number] {
    const n = GRID;
    const margin = Math.min(this.w, this.h) * 0.08;
    const size = Math.min(this.w, this.h) - margin * 2;
    const ox = (this.w - size) / 2;
    const oy = (this.h - size) / 2;
    const u = gx / (n - 1);
    const v = gy / (n - 1);
    const sx = ox + u * size;
    // z lifts the point toward the viewer (up the screen) and the tilt scales
    // with v so it feels like a slightly receding plane.
    const sy = oy + v * size - z * size * 0.16 * (0.6 + 0.4 * v);
    return [sx, sy];
  }

  draw(m: Membrane, d: RenderDrivers): void {
    const ctx = this.ctx;
    const n = GRID;

    // ── Trail wash: deep indigo, semi-transparent (never pure black). ────────
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(8, 6, 22, 0.34)";
    ctx.fillRect(0, 0, this.w, this.h);

    // Subtle radial vignette glow that pulses with tension.
    const cx = this.w / 2;
    const cy = this.h / 2;
    const glowR = Math.min(this.w, this.h) * (0.42 + d.tension * 0.1);
    const grad = ctx.createRadialGradient(cx, cy, glowR * 0.2, cx, cy, glowR);
    grad.addColorStop(0, hsl(290, 0.7, 0.12, 0.5));
    grad.addColorStop(1, hsl(250, 0.8, 0.03, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    const z = m.z;
    const areal = m.areal;

    // ── Mesh edges, shaded by areal strain, drawn additively for glow. ───────
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;

    const idx = (x: number, y: number) => y * n + x;

    // Horizontal + vertical lattice lines (structural). We shade each segment
    // by the mean areal strain of its endpoints.
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 2; x++) {
        const i0 = idx(x, y);
        const i1 = idx(x + 1, y);
        this.drawSeg(x, y, x + 1, y, areal[i0], areal[i1], z[i0], z[i1], d.brightness);
      }
    }
    for (let x = 1; x < n - 1; x++) {
      for (let y = 1; y < n - 2; y++) {
        const i0 = idx(x, y);
        const i1 = idx(x, y + 1);
        this.drawSeg(x, y, x, y + 1, areal[i0], areal[i1], z[i0], z[i1], d.brightness);
      }
    }

    // ── Bright tension nodes: glowing dots where strain is high. ─────────────
    for (let y = 2; y < n - 2; y += 1) {
      for (let x = 2; x < n - 2; x += 1) {
        const i = idx(x, y);
        const a = areal[i];
        if (a < 0.18) continue;
        const t = Math.min(a * 2.2, 1);
        const [sx, sy] = this.project(x, y, z[i]);
        const hue = 320 - t * 280; // magenta(320)→gold(40)
        const r = 0.6 + t * 2.2;
        ctx.fillStyle = hsl(hue, 0.95, 0.55, 0.5 * t);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Hot rupture rims: draw torn springs as near-white hot filaments. ─────
    for (let si = 0; si < m.springs.length; si++) {
      const sp = m.springs[si];
      if (sp.alive) continue;
      const ax = sp.a % n;
      const ay = (sp.a - ax) / n;
      const bx = sp.b % n;
      const by = (sp.b - bx) / n;
      const [p0x, p0y] = this.project(ax, ay, z[sp.a]);
      const [p1x, p1y] = this.project(bx, by, z[sp.b]);
      ctx.strokeStyle = hsl(45, 1, 0.78, 0.5);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.lineTo(p1x, p1y);
      ctx.stroke();
      // hot core
      ctx.strokeStyle = hsl(20, 1, 0.92, 0.4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // ── Pinned boundary frame (faint ring of the drumhead). ──────────────────
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = hsl(265, 0.6, 0.5, 0.25);
    ctx.lineWidth = 1.5;
    const [tlx, tly] = this.project(1, 1, 0);
    const [trx, , ] = this.project(n - 2, 1, 0);
    const [, bly] = this.project(1, n - 2, 0);
    ctx.strokeRect(tlx, tly, trx - tlx, bly - tly);
  }

  private drawSeg(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    sa: number,
    sb: number,
    za: number,
    zb: number,
    brightness: number
  ): void {
    const ctx = this.ctx;
    const strain = (sa + sb) * 0.5;
    const t = Math.min(strain * 2.4, 1); // 0 slack → 1 taut
    // Robust hue ramp through the palette: indigo(255) → magenta(315) → gold(45).
    // Below half-strain we move indigo→magenta; above it magenta→gold (405→45).
    let h: number;
    if (t < 0.5) {
      h = 255 + (315 - 255) * (t / 0.5);
    } else {
      h = 315 + (405 - 315) * ((t - 0.5) / 0.5); // 405 wraps to 45 (gold)
    }
    const light = 0.16 + t * 0.42 + brightness * 0.08;
    const alpha = 0.1 + t * 0.55;
    const [p0x, p0y] = this.project(ax, ay, za);
    const [p1x, p1y] = this.project(bx, by, zb);
    ctx.strokeStyle = hsl(h % 360, 0.85, light, alpha);
    ctx.lineWidth = 0.6 + t * 1.6;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.stroke();
  }

  // Map a screen (CSS px) coordinate back to grid space for pointer input.
  screenToGrid(px: number, py: number): [number, number] {
    const n = GRID;
    const margin = Math.min(this.w, this.h) * 0.08;
    const size = Math.min(this.w, this.h) - margin * 2;
    const ox = (this.w - size) / 2;
    const oy = (this.h - size) / 2;
    const gx = ((px - ox) / size) * (n - 1);
    const gy = ((py - oy) / size) * (n - 1);
    return [gx, gy];
  }
}
