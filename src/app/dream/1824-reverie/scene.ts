// 1824-reverie — Canvas2D visuals
//
// A cinematic, letterboxed frame — "the score to an unseen film". The stage is
// abstract (NOT literal imagery): a drifting particle field over a horizon line
// whose colour and energy read the current act's mood + tension, with a slow
// bloom at the climax. A chapter TITLE CARD fades in at every act boundary.
//
// Along the bottom letterbox bar sits the STRUCTURE RIBBON: coloured act blocks
// interleaved with the director's bridge segments (each labelled swell /
// suspended / ritardando / pivot), the dramatic TENSION envelope plotted above
// them, and a moving playhead — so Freytag's pyramid is visible while it plays.
//
// All time comes from the engine (AudioContext.currentTime) or a frame counter —
// never wall-clock. Deterministic drift via mulberry32(0x1824). Safe luminance:
// no strobe, slow changes only.

import type { ReverieEngine, Snapshot } from "./audio";

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

const BRIDGE_LABEL_HUE = 300;

interface Mote {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  vx: number;
  vy: number;
  size: number;
  hueOff: number;
  twinkle: number;
}

export class Scene {
  private engine: ReverieEngine;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private rng = mulberry32(0x1824);
  private raf = 0;
  private running = false;
  private reduced: boolean;

  private w = 0;
  private h = 0;
  private dpr = 1;

  private motes: Mote[] = [];
  private smoothTension = 0.14;
  private smoothBloom = 0;
  private baseHue: number;
  private bright: number;

  constructor(engine: ReverieEngine, canvas: HTMLCanvasElement, reduced: boolean) {
    this.engine = engine;
    this.canvas = canvas;
    this.reduced = reduced;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d");
    this.g = ctx;
    const mood = engine.getMood();
    this.baseHue = mood.hue;
    this.bright = mood.bright;

    const n = reduced ? 70 : 240;
    for (let i = 0; i < n; i++) {
      this.motes.push({
        x: this.rng(),
        y: this.rng(),
        vx: (this.rng() - 0.5) * 0.0006,
        vy: (this.rng() - 0.5) * 0.0004 - 0.0002,
        size: 0.6 + this.rng() * 2.2,
        hueOff: (this.rng() - 0.5) * 40,
        twinkle: this.rng() * Math.PI * 2,
      });
    }
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
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw() {
    const g = this.g;
    const W = this.w;
    const H = this.h;
    const snap = this.engine.snapshot();

    // smoothed, slow-moving visual state (safe luminance)
    this.smoothTension += (snap.tension - this.smoothTension) * 0.05;
    this.smoothBloom += (snap.bloom - this.smoothBloom) * 0.04;
    const T = this.smoothTension;
    const bloom = this.smoothBloom;
    const t = this.engine.now();

    // cinematic frame layout
    const topBar = Math.min(46, H * 0.09);
    const bottomBar = Math.max(84, Math.min(112, H * 0.2));
    const cx = 0;
    const cy = topBar;
    const cw = W;
    const ch = Math.max(1, H - topBar - bottomBar);

    // whole-canvas near-black (letterbox)
    g.fillStyle = "#040308";
    g.fillRect(0, 0, W, H);

    // ── stage (clipped to the content frame) ──────────────────────────────────
    g.save();
    g.beginPath();
    g.rect(cx, cy, cw, ch);
    g.clip();

    // background: deep mood gradient, brightens slowly with tension + bloom
    const bgL = 5 + T * 7 * this.bright + bloom * 8;
    const bg = g.createLinearGradient(0, cy, 0, cy + ch);
    bg.addColorStop(0, `hsl(${this.baseHue - 12} 55% ${bgL + 3}%)`);
    bg.addColorStop(0.6, `hsl(${this.baseHue} 60% ${Math.max(3, bgL)}%)`);
    bg.addColorStop(1, `hsl(${this.baseHue + 16} 65% ${Math.max(2, bgL - 3)}%)`);
    g.fillStyle = bg;
    g.fillRect(cx, cy, cw, ch);

    // horizon line — rises with tension (the drama "lifting")
    const horizon = cy + ch * (0.82 - T * 0.34);
    const glow = g.createLinearGradient(0, horizon - ch * 0.28, 0, horizon + 2);
    const hLight = 22 + T * 40 + bloom * 22;
    glow.addColorStop(0, `hsl(${this.baseHue + 20} 80% ${Math.min(72, hLight)}% / 0)`);
    glow.addColorStop(1, `hsl(${this.baseHue + 20} 90% ${Math.min(78, hLight)}% / ${0.35 + T * 0.4})`);
    g.fillStyle = glow;
    g.fillRect(cx, horizon - ch * 0.28, cw, ch * 0.28 + 2);
    g.strokeStyle = `hsl(${this.baseHue + 24} 90% ${Math.min(82, hLight + 12)}% / ${0.5 + T * 0.4})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx, horizon);
    g.lineTo(cx + cw, horizon);
    g.stroke();

    // drifting particle field (abstract). density/energy read tension.
    g.save();
    g.globalCompositeOperation = "lighter";
    const drift = this.reduced ? 0.25 : 1;
    const speed = (0.4 + T * 1.6) * drift;
    for (const m of this.motes) {
      m.x += m.vx * speed * 60;
      m.y += m.vy * speed * 60;
      // gentle upward convection toward the horizon during rising tension
      m.y -= (0.00008 + T * 0.0002) * speed * 60;
      if (m.x < 0) m.x += 1;
      if (m.x > 1) m.x -= 1;
      if (m.y < 0) m.y += 1;
      if (m.y > 1) m.y -= 1;
      const px = cx + m.x * cw;
      const py = cy + m.y * ch;
      const tw = 0.55 + 0.45 * Math.sin(t * 1.3 + m.twinkle);
      const a = (0.12 + T * 0.4) * tw;
      const sz = m.size * (1 + T * 0.6 + bloom * 0.8 + snap.motifPulse * 0.9);
      g.fillStyle = `hsl(${this.baseHue + m.hueOff + T * 24} 85% ${58 + this.bright * 18}% / ${a})`;
      g.beginPath();
      g.arc(px, py, sz, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // leitmotif shimmer — a soft ring pulse when the motif sounds
    if (snap.motifPulse > 0.01) {
      const r = (0.2 + (1 - snap.motifPulse) * 0.5) * Math.min(cw, ch);
      g.strokeStyle = `hsl(${this.baseHue + 30} 90% 72% / ${snap.motifPulse * 0.4})`;
      g.lineWidth = 1 + snap.motifPulse * 2;
      g.beginPath();
      g.arc(cx + cw / 2, horizon - ch * 0.12, r, 0, Math.PI * 2);
      g.stroke();
    }

    // climax bloom — slow one-shot luminance rise (no strobe)
    if (bloom > 0.001) {
      const bx = cx + cw / 2;
      const by = horizon - ch * 0.1;
      const rad = g.createRadialGradient(bx, by, 0, bx, by, Math.max(cw, ch) * 0.7);
      const a = bloom * (this.reduced ? 0.2 : 0.42);
      rad.addColorStop(0, `hsl(${this.baseHue + 30} 100% 80% / ${a})`);
      rad.addColorStop(0.5, `hsl(${this.baseHue + 10} 100% 66% / ${a * 0.4})`);
      rad.addColorStop(1, `hsl(${this.baseHue} 100% 60% / 0)`);
      g.fillStyle = rad;
      g.fillRect(cx, cy, cw, ch);
    }

    // timpani impact — a brief soft vignette pulse at the frame edges
    if (snap.impact > 0.01) {
      const vig = g.createRadialGradient(
        cx + cw / 2,
        cy + ch / 2,
        Math.min(cw, ch) * 0.3,
        cx + cw / 2,
        cy + ch / 2,
        Math.max(cw, ch) * 0.72,
      );
      vig.addColorStop(0, "hsl(0 0% 0% / 0)");
      vig.addColorStop(1, `hsl(${this.baseHue} 70% 40% / ${snap.impact * 0.35})`);
      g.fillStyle = vig;
      g.fillRect(cx, cy, cw, ch);
    }

    g.restore(); // unclip

    // ── chapter title card ─────────────────────────────────────────────────────
    if (snap.cardAlpha > 0.01 && snap.cardText) {
      g.save();
      g.globalAlpha = snap.cardAlpha;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const titleY = cy + ch * 0.44;
      g.fillStyle = "hsl(0 0% 96%)";
      const fs = Math.max(22, Math.min(46, cw * 0.052));
      g.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
      g.fillText(snap.cardText, cx + cw / 2, titleY);
      // small thin rule beneath
      g.strokeStyle = "hsl(0 0% 96% / 0.6)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx + cw / 2 - fs * 1.4, titleY + fs * 0.85);
      g.lineTo(cx + cw / 2 + fs * 1.4, titleY + fs * 0.85);
      g.stroke();
      g.restore();
    }

    // thin film frame around the content
    g.strokeStyle = "hsl(0 0% 100% / 0.06)";
    g.lineWidth = 1;
    g.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);

    // ── structure ribbon in the bottom letterbox bar ──────────────────────────
    this.drawRibbon(snap, W, H, bottomBar);
  }

  private drawRibbon(snap: Snapshot, W: number, H: number, bottomBar: number) {
    const g = this.g;
    const pad = 16;
    const innerW = W - pad * 2;
    const blockH = 20;
    const envH = Math.max(22, bottomBar - blockH - 34);
    const blockTop = H - blockH - 12;
    const envTop = blockTop - envH - 6;
    const segments = this.engine.getSegments();
    const total = segments.reduce((s, x) => s + x.beats, 0) || 1;

    // tension envelope (sample each segment's own curve)
    g.save();
    g.beginPath();
    let first = true;
    let acc = 0;
    for (const seg of segments) {
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const e = this.engine.tensionForSegment(seg, p);
        const x = pad + ((acc + p * seg.beats) / total) * innerW;
        const y = envTop + envH - e * envH;
        if (first) {
          g.moveTo(x, y);
          first = false;
        } else g.lineTo(x, y);
      }
      acc += seg.beats;
    }
    g.strokeStyle = `hsl(${this.baseHue + 20} 85% 72% / 0.9)`;
    g.lineWidth = 1.5;
    g.stroke();
    g.lineTo(pad + innerW, envTop + envH);
    g.lineTo(pad, envTop + envH);
    g.closePath();
    g.fillStyle = `hsl(${this.baseHue + 10} 70% 55% / 0.08)`;
    g.fill();
    g.restore();

    // segment blocks: acts (solid) + bridges (hatched, labelled)
    acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const x = pad + (acc / total) * innerW;
      const w = (seg.beats / total) * innerW;
      const active = i === snap.segIndex;
      if (seg.kind === "act") {
        g.fillStyle = active
          ? `hsl(${seg.hue} 82% 58% / 0.95)`
          : `hsl(${seg.hue} 52% 44% / 0.5)`;
        this.roundRect(x + 1, blockTop, Math.max(1, w - 2), blockH, 3);
        g.fill();
      } else {
        // bridge: narrower, brighter accent bar — the "seam"
        g.fillStyle = active
          ? `hsl(${seg.hue} 90% 66% / 0.95)`
          : `hsl(${seg.hue} 70% 52% / 0.6)`;
        this.roundRect(x + 1, blockTop + blockH * 0.2, Math.max(1, w - 2), blockH * 0.6, 2);
        g.fill();
      }
      // label
      g.font = "600 8px ui-monospace, monospace";
      g.textAlign = "left";
      g.textBaseline = "middle";
      if (seg.kind === "act" && w > 30) {
        g.fillStyle = active ? "hsl(0 0% 100% / 0.95)" : "hsl(0 0% 100% / 0.5)";
        g.fillText(seg.name.split(" ")[0].toLowerCase(), x + 5, blockTop + blockH / 2);
      }
      acc += seg.beats;
    }

    // bridge label above the active seam
    if (snap.bridgeKind) {
      g.fillStyle = `hsl(${BRIDGE_LABEL_HUE} 90% 74% / 0.95)`;
      g.font = "600 9px ui-monospace, monospace";
      g.textAlign = "center";
      const px = pad + snap.playhead * innerW;
      g.fillText(`↯ ${snap.bridgeKind}`, px, envTop - 6);
    }

    // playhead
    const px = pad + snap.playhead * innerW;
    g.strokeStyle = "hsl(0 0% 100% / 0.9)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, envTop - 2);
    g.lineTo(px, blockTop + blockH);
    g.stroke();
    const dotY = envTop + envH - snap.tension * envH;
    g.fillStyle = "hsl(0 0% 100% / 1)";
    g.beginPath();
    g.arc(px, dotY, 3, 0, Math.PI * 2);
    g.fill();

    // meta line: current act + tension %
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = "600 10px ui-monospace, monospace";
    g.fillStyle = "hsl(0 0% 100% / 0.7)";
    const kindTag = snap.segKind === "bridge" ? "bridge" : "act";
    g.fillText(
      `${kindTag} · ${snap.actLabel.toLowerCase()} · tension ${Math.round(snap.tension * 100)}%`,
      pad,
      envTop - 8,
    );
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
