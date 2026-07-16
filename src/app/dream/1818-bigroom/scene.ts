// 1818-bigroom — Canvas2D visuals
//
// Main stage: a reactive violet skyline + particle field that BLOOMS on the
// drop (a smooth luminance burst, ≤3Hz, one-shot) and visibly PUMPS with the
// sidechain. Bottom: the EDMFormer "structure ribbon" — section blocks with a
// moving playhead, and the energy envelope curve plotted above it.

import type { BigRoomEngine, Snapshot, Section } from "./audio";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
}

const kindLabel: Record<Section["kind"], string> = {
  intro: "intro",
  buildup: "build",
  drop: "drop",
  breakdown: "break",
  outro: "outro",
};

export class Scene {
  private engine: BigRoomEngine;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private rng = mulberry32(0x1818);
  private raf = 0;
  private running = false;
  private reduced: boolean;

  private w = 0;
  private h = 0;
  private dpr = 1;

  private particles: Particle[] = [];
  private nBars = 64;
  private barPhase: number[] = [];
  private lastBloom = 0;
  private smoothEnergy = 0;

  constructor(engine: BigRoomEngine, canvas: HTMLCanvasElement, reduced: boolean) {
    this.engine = engine;
    this.canvas = canvas;
    this.reduced = reduced;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d");
    this.g = ctx;
    for (let i = 0; i < this.nBars; i++) this.barPhase[i] = this.rng() * Math.PI * 2;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private spawnBurst(snap: Snapshot, n: number) {
    const cx = this.w / 2;
    const cy = this.h * 0.52;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const spd = 1.5 + this.rng() * (this.reduced ? 3 : 7);
      const max = 40 + this.rng() * 60;
      this.particles.push({
        x: cx + (this.rng() - 0.5) * 40,
        y: cy + (this.rng() - 0.5) * 40,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1.2,
        life: max,
        max,
        hue: 275 + this.rng() * 70,
        size: 1.5 + this.rng() * 3,
      });
    }
    if (this.particles.length > 1400) this.particles.splice(0, this.particles.length - 1400);
  }

  private frame() {
    const g = this.g;
    const snap = this.engine.snapshot();
    const W = this.w;
    const H = this.h;

    // smoothed energy for visual stability
    this.smoothEnergy += (snap.energy - this.smoothEnergy) * 0.12;
    const E = this.smoothEnergy;
    const punch = snap.pumpPunch;

    // drop bloom edge -> spawn a particle burst once per drop
    if (snap.bloom > 0.5 && this.lastBloom <= 0.5) {
      this.spawnBurst(snap, this.reduced ? 120 : 320);
    }
    this.lastBloom = snap.bloom;

    // ── background (dark violet, brightens with energy + drop bloom) ──────────
    const bgL = 4 + E * 6 + snap.bloom * 10;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(258 55% ${bgL + 3}%)`);
    bg.addColorStop(1, `hsl(272 60% ${Math.max(2, bgL - 2)}%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const stageBottom = H - 92; // leave room for the ribbon
    const t = performance.now() / 1000;

    // ── skyline: reactive violet bars, pump with the sidechain ────────────────
    const pumpScale = 1 + punch * (this.reduced ? 0.12 : 0.4);
    g.save();
    g.globalCompositeOperation = "lighter";
    const bw = W / this.nBars;
    for (let i = 0; i < this.nBars; i++) {
      const mid = this.nBars / 2;
      const centerBias = 1 - Math.abs(i - mid) / mid; // taller toward center
      const wob = 0.5 + 0.5 * Math.sin(t * (0.6 + E) + this.barPhase[i] + i * 0.3);
      const base = 0.08 + centerBias * 0.5;
      let hgt = (base + wob * (0.15 + E * 0.7)) * (stageBottom * 0.82);
      hgt *= pumpScale;
      hgt = Math.min(hgt, stageBottom * 0.98);
      const x = i * bw;
      const hue = 268 + centerBias * 40 + E * 20;
      const light = 30 + E * 28 + snap.bloom * 25 + punch * 12;
      const grad = g.createLinearGradient(0, stageBottom, 0, stageBottom - hgt);
      grad.addColorStop(0, `hsl(${hue} 80% ${Math.min(70, light)}% / 0.9)`);
      grad.addColorStop(1, `hsl(${hue + 20} 90% ${Math.min(80, light + 15)}% / 0.15)`);
      g.fillStyle = grad;
      g.fillRect(x + bw * 0.12, stageBottom - hgt, bw * 0.76, hgt);
    }
    g.restore();

    // ── build riser indicator: a rising sweep line during buildups ────────────
    if (snap.sectionKind === "buildup" && snap.buildProgress > 0.6) {
      const p = (snap.buildProgress - 0.6) / 0.4;
      const y = stageBottom - p * stageBottom * 0.9;
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = `hsl(300 90% ${45 + p * 30}% / ${0.15 + p * 0.5})`;
      g.lineWidth = 1 + p * 3;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y + Math.sin(t * 8) * 6);
      g.stroke();
      g.restore();
    }

    // ── particles ─────────────────────────────────────────────────────────────
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const damp = this.reduced ? 0.9 : 0.985;
      p.vx *= damp;
      p.vy = p.vy * damp + 0.04;
      p.x += p.vx * (1 + punch);
      p.y += p.vy * (1 + punch);
      p.life -= 1;
      if (p.life <= 0 || p.y > stageBottom + 30) {
        this.particles.splice(i, 1);
        continue;
      }
      const a = (p.life / p.max) * (0.5 + E * 0.5);
      g.fillStyle = `hsl(${p.hue} 90% 65% / ${a})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (1 + punch * 0.6), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // ── smooth drop bloom overlay (one-shot luminance rise, ≤3Hz safe) ────────
    if (snap.bloom > 0.001) {
      const rad = g.createRadialGradient(W / 2, stageBottom * 0.5, 0, W / 2, stageBottom * 0.5, W * 0.7);
      const a = snap.bloom * (this.reduced ? 0.22 : 0.55);
      rad.addColorStop(0, `hsl(295 100% 80% / ${a})`);
      rad.addColorStop(0.5, `hsl(285 100% 65% / ${a * 0.4})`);
      rad.addColorStop(1, "hsl(285 100% 65% / 0)");
      g.fillStyle = rad;
      g.fillRect(0, 0, W, H);
    }

    // ── structure ribbon + energy envelope ────────────────────────────────────
    this.drawRibbon(snap);
  }

  private drawRibbon(snap: Snapshot) {
    const g = this.g;
    const W = this.w;
    const H = this.h;
    const ribbonH = 34;
    const envH = 40;
    const pad = 14;
    const top = H - ribbonH - 8;
    const envTop = top - envH - 4;
    const sections = this.engine.getSections();
    const total = sections.reduce((s, x) => s + x.bars, 0) || 1;

    // energy envelope (sample each section's base curve)
    g.save();
    g.beginPath();
    let first = true;
    let accBars = 0;
    for (const sec of sections) {
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const e = this.engine.energyForSection(sec, p);
        const x = pad + ((accBars + p * sec.bars) / total) * (W - pad * 2);
        const y = envTop + envH - e * envH;
        if (first) {
          g.moveTo(x, y);
          first = false;
        } else g.lineTo(x, y);
      }
      accBars += sec.bars;
    }
    g.strokeStyle = "hsl(300 90% 70% / 0.85)";
    g.lineWidth = 1.5;
    g.stroke();
    // fill under curve faintly
    g.lineTo(pad + (W - pad * 2), envTop + envH);
    g.lineTo(pad, envTop + envH);
    g.closePath();
    g.fillStyle = "hsl(285 80% 55% / 0.08)";
    g.fill();
    g.restore();

    // section blocks
    accBars = 0;
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const x = pad + (accBars / total) * (W - pad * 2);
      const w = (sec.bars / total) * (W - pad * 2);
      const active = i === snap.sectionIndex;
      g.fillStyle = active
        ? `hsl(${sec.hue} 85% 55% / 0.95)`
        : `hsl(${sec.hue} 55% 42% / 0.55)`;
      this.roundRect(x + 1, top, Math.max(1, w - 2), ribbonH, 4);
      g.fill();
      // label
      g.fillStyle = active ? "hsl(0 0% 100% / 0.95)" : "hsl(0 0% 100% / 0.5)";
      g.font = "600 9px ui-monospace, monospace";
      g.textBaseline = "middle";
      const label = kindLabel[sec.kind];
      if (w > 26) g.fillText(label, x + 5, top + ribbonH / 2);
      accBars += sec.bars;
    }

    // playhead
    const px = pad + snap.playhead * (W - pad * 2);
    g.strokeStyle = "hsl(0 0% 100% / 0.9)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, envTop - 2);
    g.lineTo(px, top + ribbonH);
    g.stroke();
    // energy dot at playhead
    const dotY = envTop + envH - snap.baseEnergy * envH;
    g.fillStyle = "hsl(300 100% 80% / 1)";
    g.beginPath();
    g.arc(px, dotY, 3.2, 0, Math.PI * 2);
    g.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const g = this.g;
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }
}
