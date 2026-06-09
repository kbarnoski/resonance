// ─────────────────────────────────────────────────────────────────────────────
// field.ts — Synthesized latent field canvas renderer for "454 Piano Caption
// Loom". Used as the NO-KEY fallback (no FAL_KEY → no real image).
//
// Produces a plasma/particle field driven by the MusicalFrame's features
// (valence, arousal, dominant pitch-class, RMS, onset) + the final caption
// from the loom. The refinement loom stays fully alive; the AV piece is
// complete with no API key.
//
// Public API:
//   initField(canvas) → FieldRenderer
//   renderer.drawField(frame, loomCaption, now, dt)
//   renderer.addBloom(x, y, hue)
//   renderer.destroy()
// ─────────────────────────────────────────────────────────────────────────────

import type { MusicalFrame } from "./analysis";

// Pitch-class → canvas hue degree (C=0…B=11)
const PC_HUE: readonly number[] = [150, 185, 200, 260, 280, 340, 20, 40, 80, 220, 300, 240];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  size: number;
  hue: number;
  sat: number;
  lit: number;
}

interface BloomPulse {
  x: number; y: number;
  age: number;
  maxAge: number;
  hue: number;
}

export interface FieldRenderer {
  drawField: (frame: MusicalFrame, caption: string, now: number, dt: number) => void;
  addBloom: (x: number, y: number, hue: number) => void;
  destroy: () => void;
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2 = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 0.5) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue2(p, q, h + 1 / 3);
    g = hue2(p, q, h);
    b = hue2(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function spawnParticle(W: number, H: number, hue: number, energy: number): Particle {
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = Math.random() * W; y = 0; }
  else if (edge === 1) { x = W; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = H; }
  else { x = 0; y = Math.random() * H; }
  const cx = W / 2, cy = H / 2;
  const spd = (0.6 + Math.random() * 0.8) * (0.3 + energy * 1.2) * (W / 800);
  const ang = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 1.4;
  return {
    x, y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    life: 1,
    size: 1.2 + Math.random() * 2.8 + energy * 2,
    hue: (hue + (Math.random() - 0.5) * 30 + 360) % 360,
    sat: 55 + Math.random() * 35,
    lit: 50 + Math.random() * 35,
  };
}

const MAX_PARTICLES = 260;

export function initField(canvas: HTMLCanvasElement): FieldRenderer {
  const ctx2d = canvas.getContext("2d", { alpha: false });
  if (!ctx2d) throw new Error("no 2d context");
  const ctx = ctx2d;

  const offCanvas = document.createElement("canvas");
  const offCtx = offCanvas.getContext("2d")!;
  let offW = 0, offH = 0;

  const particles: Particle[] = [];
  const blooms: BloomPulse[] = [];

  // Pre-seed particles
  for (let i = 0; i < 120; i++) particles.push(spawnParticle(800, 600, 220, 0.2));

  function addBloom(x: number, y: number, hue: number): void {
    blooms.push({ x, y, age: 0, maxAge: 1.2, hue });
    if (blooms.length > 20) blooms.shift();
  }

  function ensureSize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(canvas.clientWidth * dpr);
    const H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W || 1;
      canvas.height = H || 1;
    }
    if (offW !== canvas.width || offH !== canvas.height) {
      offCanvas.width = Math.max(1, Math.floor(canvas.width / 5));
      offCanvas.height = Math.max(1, Math.floor(canvas.height / 5));
      offW = canvas.width;
      offH = canvas.height;
    }
  }

  function drawField(frame: MusicalFrame, _caption: string, now: number, dt: number): void {
    ensureSize();
    const W = canvas.width, H = canvas.height;
    if (W === 0 || H === 0) return;
    const { rms, dominantPc, modality, consonance, valence, arousal } = frame;
    const hue = PC_HUE[dominantPc] ?? 220;
    const t = now / 1000;

    // Valence shifts hue offset: warm = right, cool = left
    const valenceHueShift = valence * 20;
    const hShifted = (hue + valenceHueShift + 360) % 360;
    const hue2 = (hShifted + 60) % 360;
    const hue3 = (hShifted + 200) % 360;
    const satBoost = 20 + consonance * 30;

    // ── Plasma (offscreen low-res) ────────────────────────────────────────
    const OW = offCanvas.width, OH = offCanvas.height;
    const imgData = offCtx.createImageData(OW, OH);
    const d = imgData.data;
    const hueOffset = modality === "major" ? 0 : modality === "minor" ? 40 : 0;

    // Arousal controls speed of plasma animation
    const speed = 0.2 + Math.max(0, arousal) * 0.5;

    for (let py = 0; py < OH; py++) {
      for (let px = 0; px < OW; px++) {
        const nx = px / OW, ny = py / OH;
        const v1 = Math.sin(nx * 9 + t * speed * 1.7 + rms * 3);
        const v2 = Math.sin(ny * 7 - t * speed * 1.4 + rms * 2);
        const v3 = Math.sin((nx + ny) * 6 + t * speed * 1.1);
        const v4 = Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 14 - t * speed * 2.3);
        const v = (v1 + v2 + v3 + v4) / 4;
        const baseH = (hShifted + hueOffset + v * 45 * (0.5 + rms) + 360) % 360;
        const s = (40 + satBoost + rms * 10) / 100;
        const l = (6 + (v * 0.5 + 0.5) * 14 + rms * 8) / 100;
        const [r, g, b] = hsl2rgb(baseH / 360, s, l);
        const idx = (py * OW + px) * 4;
        d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(offCanvas, 0, 0, W, H);
    ctx.restore();

    // ── Orbiting volumetric blobs ─────────────────────────────────────────
    const blobHues = [hShifted, hue2, hue3];
    for (let bi = 0; bi < 3; bi++) {
      const phase = t * (0.08 + bi * 0.035) + bi * 2.1;
      const bx = W * (0.5 + Math.sin(phase) * 0.3);
      const by = H * (0.5 + Math.cos(phase * 1.4) * 0.24);
      const bRad = W * (0.22 + rms * 0.22 + Math.sin(phase * 2.2) * 0.04);
      const sat = 55 + satBoost * 0.5;
      const lit = 28 + rms * 28;
      const alpha = 0.10 + consonance * 0.08 + rms * 0.07;
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, bRad);
      rg.addColorStop(0, `hsla(${blobHues[bi]}, ${sat}%, ${lit}%, ${alpha})`);
      rg.addColorStop(0.5, `hsla(${blobHues[bi]}, ${sat}%, ${lit * 0.55}%, ${alpha * 0.35})`);
      rg.addColorStop(1, `hsla(${blobHues[bi]}, ${sat}%, ${lit * 0.25}%, 0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Particles ─────────────────────────────────────────────────────────
    const toSpawn = (1.5 + rms * 10) * dt;
    let spawned = 0;
    while (spawned < toSpawn && particles.length < MAX_PARTICLES) {
      if (Math.random() < Math.min(1, toSpawn - spawned)) {
        particles.push(spawnParticle(W, H, hue, rms));
      }
      spawned++;
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const flow =
        Math.sin((p.x / W) * 5 + t * 0.55) * Math.PI +
        Math.cos((p.y / H) * 5 + t * 0.42) * Math.PI * 0.5;
      const spd2 = (0.06 + rms * 0.2) * W * dt;
      p.vx += Math.cos(flow) * spd2 * 0.3;
      p.vy += Math.sin(flow) * spd2 * 0.3;
      p.vx *= 0.93; p.vy *= 0.93;
      p.x += p.vx; p.y += p.vy;
      p.life -= dt * (0.1 + rms * 0.07);
      if (p.life <= 0 || p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) {
        particles.splice(i, 1);
        particles.unshift(spawnParticle(W, H, hue, rms));
        continue;
      }
      const a = Math.min(1, p.life * 2) * 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + rms * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.lit}%, ${a})`;
      ctx.fill();
    }
    ctx.restore();

    // ── Bloom overlays ────────────────────────────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i];
      b.age += dt;
      if (b.age > b.maxAge) { blooms.splice(i, 1); continue; }
      const tp = b.age / b.maxAge;
      const alpha = Math.sin(tp * Math.PI) * 0.55;
      const radius = W * (0.04 + tp * 0.18);
      const rg2 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
      rg2.addColorStop(0, `hsla(${b.hue}, 80%, 80%, ${alpha})`);
      rg2.addColorStop(0.4, `hsla(${b.hue}, 70%, 65%, ${alpha * 0.5})`);
      rg2.addColorStop(1, `hsla(${b.hue}, 60%, 50%, 0)`);
      ctx.fillStyle = rg2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── Vignette ──────────────────────────────────────────────────────────
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.82);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function destroy(): void {
    particles.length = 0;
    blooms.length = 0;
  }

  return { drawField, addBloom, destroy };
}
