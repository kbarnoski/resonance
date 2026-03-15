"use client";

import { useRef, useEffect } from "react";

interface PostProcessingLayerProps {
  chromaticAberration: number; // 0-1
  vignette: number;           // 0-1
  bloomIntensity: number;     // 0-1
  audioAmplitude: number;     // 0-1
  filmGrain: number;          // 0-1
  particleDensity: number;    // 0-1
  halation: number;           // 0-1
  palette: {
    primary: string;
    accent: string;
    glow: string;
    secondary: string;
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// Pre-generate grain textures once (4 variants for variety)
const GRAIN_TEXTURES: HTMLCanvasElement[] = [];
const GRAIN_SIZE = 128;

function ensureGrainTextures() {
  if (GRAIN_TEXTURES.length > 0) return;
  for (let t = 0; t < 4; t++) {
    const c = document.createElement("canvas");
    c.width = GRAIN_SIZE;
    c.height = GRAIN_SIZE;
    const g = c.getContext("2d")!;
    const img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    GRAIN_TEXTURES.push(c);
  }
}

/**
 * Post-processing overlay layer (canvas-based, 60fps):
 * - Vignette (radial gradient)
 * - Bloom glow (center radial gradient)
 * - Film grain (pre-generated textures, cycled)
 * - Halation (warm glow)
 * - Particles (floating luminous motes)
 */
export function PostProcessingLayer({
  chromaticAberration: _chromaticAberration,
  vignette,
  bloomIntensity,
  audioAmplitude,
  filmGrain,
  particleDensity,
  halation,
  palette,
}: PostProcessingLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const grainIndexRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ensureGrainTextures();

    let lastTime = performance.now();

    function render(now: number) {
      if (!canvas || !ctx) return;

      const dt = Math.min((now - lastTime) / 1000, 0.05); // Cap at 50ms
      lastTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      const dpr = devicePixelRatio;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;

      // Only resize when needed
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // --- Vignette ---
      if (vignette > 0.01) {
        const gradient = ctx.createRadialGradient(
          w / 2, h / 2, w * 0.3,
          w / 2, h / 2, w * 0.8
        );
        gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(1, `rgba(0, 0, 0, ${vignette * 0.55})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }

      // --- Bloom glow ---
      if (bloomIntensity > 0.2) {
        const glowGradient = ctx.createRadialGradient(
          w / 2, h / 2, 0,
          w / 2, h / 2, w * 0.5
        );
        const glowAlpha = (bloomIntensity - 0.2) * 0.15 * (0.5 + audioAmplitude * 0.5);
        glowGradient.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`);
        glowGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }

      // --- Halation (warm glow) ---
      if (halation > 0.02) {
        const halGradient = ctx.createRadialGradient(
          w * (0.5 + Math.sin(t * 0.3) * 0.1),
          h * (0.5 + Math.cos(t * 0.2) * 0.1),
          0,
          w / 2, h / 2, w * 0.6
        );
        const halAlpha = halation * 0.12 * (0.6 + audioAmplitude * 0.4);
        const a1 = Math.round(halAlpha * 255).toString(16).padStart(2, "0");
        const a2 = Math.round(halAlpha * 128).toString(16).padStart(2, "0");
        halGradient.addColorStop(0, `${palette.glow}${a1}`);
        halGradient.addColorStop(0.5, `${palette.accent}${a2}`);
        halGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = halGradient;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }

      // --- Film grain (pre-generated, cycled) ---
      if (filmGrain > 0.02 && GRAIN_TEXTURES.length > 0) {
        const grainAlpha = filmGrain * (0.5 + audioAmplitude * 0.3);
        grainIndexRef.current = (grainIndexRef.current + 1) % GRAIN_TEXTURES.length;
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = grainAlpha * 0.4;
        ctx.drawImage(GRAIN_TEXTURES[grainIndexRef.current], 0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // --- Particles ---
      if (particleDensity > 0.02) {
        const targetCount = Math.floor(particleDensity * 60); // Reduced from 150
        const particles = particlesRef.current;

        // Spawn new particles (capped per frame)
        let spawned = 0;
        while (particles.length < targetCount && spawned < 3) {
          particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.2 - Math.random() * 0.5,
            size: 1 + Math.random() * 2,
            alpha: 0,
            life: 0,
            maxLife: 3 + Math.random() * 5,
          });
          spawned++;
        }

        ctx.fillStyle = palette.glow;

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life += dt;
          p.x += p.vx + Math.sin(t + p.y * 0.01) * 0.3;
          p.y += p.vy;

          const lifeProgress = p.life / p.maxLife;
          if (lifeProgress < 0.2) {
            p.alpha = lifeProgress / 0.2;
          } else if (lifeProgress > 0.8) {
            p.alpha = (1 - lifeProgress) / 0.2;
          } else {
            p.alpha = 1;
          }

          if (p.life >= p.maxLife || p.y < -10 || p.x < -10 || p.x > w + 10) {
            particles.splice(i, 1);
            continue;
          }

          // Single draw call per particle (no separate glow)
          ctx.globalAlpha = p.alpha * 0.5 * particleDensity;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [vignette, bloomIntensity, audioAmplitude, filmGrain, particleDensity, halation, palette]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 3 }}
    />
  );
}
