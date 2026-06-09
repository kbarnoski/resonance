// ─────────────────────────────────────────────────────────────────────────────
// field.ts — locally-synthesized fallback canvas renderer for
// "Latent Listening Room". Used when FAL_KEY is absent or any image request
// fails. Produces soft plasma / radial gradient / particle-flow visuals
// driven by the same spectral analysis that builds prompts.
//
// Public API:
//   initField(canvas) → FieldRenderer
//   renderer.drawFrame(spectral, now, dt)
//   renderer.destroy()
// ─────────────────────────────────────────────────────────────────────────────

import type { SpectralFrame } from "./audio";

// ── Pitch-class → base hue mapping ───────────────────────────────────────────
// A=0, A#=1, B=2, C=3, C#=4, D=5, D#=6, E=7, F=8, F#=9, G=10, G#=11
const PC_HUE: number[] = [
  200, // A  — cerulean blue
  220, // A# — deep blue
  170, // B  — teal
  260, // C  — violet
  280, // C# — purple
  300, // D  — magenta
  330, // D# — rose
  350, // E  — crimson
  20,  // F  — orange-red
  40,  // F# — amber
  70,  // G  — gold-green
  150, // G# — green-teal
];

// ── Particle type ──────────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;   // 0-1 (1=newborn)
  size: number;
  hue: number;
  sat: number;
  lit: number;
  alpha: number;
}

const PARTICLE_COUNT = 220;

export interface FieldRenderer {
  drawFrame: (frame: SpectralFrame, now: number, dt: number) => void;
  destroy: () => void;
}

// ── Ken-Burns: slowly pan/zoom the field overlay ──────────────────────────
interface KbState {
  x: number;
  y: number;
  scale: number;
  targetX: number;
  targetY: number;
  targetScale: number;
  timer: number;
}

export function initField(canvas: HTMLCanvasElement): FieldRenderer {
  const ctxOrNull = canvas.getContext("2d", { alpha: false });
  if (!ctxOrNull) throw new Error("no 2d context");
  // Re-assign to a non-nullable variable so TypeScript doesn't re-widen in closures
  const ctx: CanvasRenderingContext2D = ctxOrNull;

  // Particles
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(spawnParticle(Math.random(), canvas.width, canvas.height));
  }

  // Ken-Burns state
  const kb: KbState = {
    x: 0, y: 0, scale: 1,
    targetX: 0, targetY: 0, targetScale: 1,
    timer: 0,
  };

  // Off-screen buffer for plasma layer
  let offW = 0;
  let offH = 0;
  const offCanvas = document.createElement("canvas");
  const offCtx = offCanvas.getContext("2d")!;

  function ensureSize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(canvas.clientWidth * dpr);
    const H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    if (offW !== canvas.width || offH !== canvas.height) {
      offCanvas.width = Math.max(1, Math.floor(canvas.width / 3)); // low-res plasma
      offCanvas.height = Math.max(1, Math.floor(canvas.height / 3));
      offW = canvas.width;
      offH = canvas.height;
    }
  }

  function spawnParticleHere(f: SpectralFrame, W: number, H: number): Particle {
    const hue = PC_HUE[f.pitchClass] ?? 220;
    const bright = 0.3 + f.centroid * 0.4;
    return spawnParticle(bright, W, H, hue, f.energy);
  }

  function drawFrame(frame: SpectralFrame, now: number, dt: number): void {
    ensureSize();
    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    const { energy, centroid, pitchClass } = frame;
    const hue = PC_HUE[pitchClass] ?? 220;
    const hue2 = (hue + 60) % 360;
    const hue3 = (hue + 180) % 360;

    // ── Draw low-res plasma layer to off-screen buffer ────────────────────
    const OW = offCanvas.width;
    const OH = offCanvas.height;
    const imgData = offCtx.createImageData(OW, OH);
    const d = imgData.data;
    const t = now / 1000;

    for (let py = 0; py < OH; py++) {
      for (let px = 0; px < OW; px++) {
        const nx = px / OW;
        const ny = py / OH;

        // Plasma formula: sum of sines in various directions
        const v1 = Math.sin(nx * 8 + t * 0.4 + centroid * 2);
        const v2 = Math.sin(ny * 7 - t * 0.3 + energy * 4);
        const v3 = Math.sin((nx + ny) * 5 + t * 0.25);
        const v4 = Math.sin(Math.sqrt((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5)) * 12 - t * 0.5);
        const v = (v1 + v2 + v3 + v4) / 4; // -1 to 1

        // Map v to hue offset
        const hShift = v * 50 * (0.5 + energy);
        const baseH = (hue + hShift + 360) % 360;
        const s = 55 + centroid * 30;
        const l = 8 + (v * 0.5 + 0.5) * 18 + energy * 8;

        const [r, g, b] = hslToRgb(baseH / 360, s / 100, l / 100);
        const idx = (py * OW + px) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imgData, 0, 0);

    // ── Ken-Burns drift ───────────────────────────────────────────────────
    kb.timer -= dt;
    if (kb.timer <= 0) {
      kb.targetX = (Math.random() - 0.5) * W * 0.08;
      kb.targetY = (Math.random() - 0.5) * H * 0.08;
      kb.targetScale = 1.02 + Math.random() * 0.06;
      kb.timer = 8 + Math.random() * 6;
    }
    kb.x += (kb.targetX - kb.x) * dt * 0.15;
    kb.y += (kb.targetY - kb.y) * dt * 0.15;
    kb.scale += (kb.targetScale - kb.scale) * dt * 0.12;

    // ── Composite to main canvas ──────────────────────────────────────────
    ctx.save();
    ctx.setTransform(kb.scale, 0, 0, kb.scale, W / 2 + kb.x, H / 2 + kb.y);
    // Upscale the plasma layer (bilinear via imageSmoothingEnabled)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(offCanvas, -W / 2, -H / 2, W, H);
    ctx.restore();

    // ── Layered radial gradients (volumetric light blobs) ─────────────────
    const blobCount = 3;
    const blobHues = [hue, hue2, hue3];
    for (let b = 0; b < blobCount; b++) {
      const phase = t * (0.07 + b * 0.04) + b * 2.1;
      const bx = W * (0.5 + Math.sin(phase) * 0.28);
      const by = H * (0.5 + Math.cos(phase * 1.3) * 0.22);
      const bRad = W * (0.25 + energy * 0.2 + Math.sin(phase * 2) * 0.05);
      const bHue = blobHues[b];
      const sat = 60 + centroid * 30;
      const lit = 30 + energy * 25;
      const alpha = 0.12 + centroid * 0.08 + energy * 0.06;

      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, bRad);
      rg.addColorStop(0, `hsla(${bHue}, ${sat}%, ${lit}%, ${alpha})`);
      rg.addColorStop(0.5, `hsla(${bHue}, ${sat}%, ${lit * 0.6}%, ${alpha * 0.4})`);
      rg.addColorStop(1, `hsla(${bHue}, ${sat}%, ${lit * 0.3}%, 0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Particle flow field ───────────────────────────────────────────────
    // Spawn new particles proportional to energy
    const spawnRate = 2 + energy * 8;
    let toSpawn = spawnRate * dt;
    while (toSpawn > 0 && particles.length < PARTICLE_COUNT) {
      if (Math.random() < Math.min(1, toSpawn)) {
        particles.push(spawnParticleHere(frame, W, H));
      }
      toSpawn -= 1;
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      // Curl-like flow: angle from plasma value
      const flowT = t * 0.6;
      const angle =
        Math.sin(p.x / W * 5 + flowT) * Math.PI +
        Math.cos(p.y / H * 5 + flowT * 0.8) * Math.PI * 0.5;
      const speed = (0.08 + energy * 0.25) * W * dt;
      p.vx += Math.cos(angle) * speed * 0.4;
      p.vy += Math.sin(angle) * speed * 0.4;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * (0.12 + energy * 0.08);

      if (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) {
        particles.splice(i, 1);
        particles.unshift(spawnParticleHere(frame, W, H));
        continue;
      }

      const a = Math.min(1, p.life * 2) * p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + energy * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.lit}%, ${a * 0.7})`;
      ctx.fill();
    }
    ctx.restore();

    // ── Vignette ──────────────────────────────────────────────────────────
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function destroy(): void {
    // nothing to clean up besides GC
  }

  return { drawFrame, destroy };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function spawnParticle(bright: number, W: number, H: number, hue?: number, energy?: number): Particle {
  const h = hue ?? (180 + Math.random() * 120);
  const e = energy ?? 0.2;
  return {
    x: Math.random() * (W || 800),
    y: Math.random() * (H || 600),
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    life: 0.6 + Math.random() * 0.4,
    size: 1.5 + bright * 3.5 + e * 2,
    hue: h,
    sat: 55 + Math.random() * 30,
    lit: 55 + bright * 30,
    alpha: 0.25 + bright * 0.35,
  };
}

/** hsl (each 0-1) → rgb (each 0-255) */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
