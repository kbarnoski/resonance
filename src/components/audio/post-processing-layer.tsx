"use client";

import { useRef, useEffect } from "react";
import { getDeviceTier } from "@/lib/audio/device-tier";

/** Expand 3-char hex (#RGB) to 6-char (#RRGGBB) so alpha bytes can be appended */
function hex6(color: string): string {
  if (color.length === 4 && color[0] === "#") {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return color;
}

interface PostProcessingLayerProps {
  chromaticAberration: number; // 0-1
  vignette: number;           // 0-1
  bloomIntensity: number;     // 0-1
  audioAmplitude: number;     // 0-1
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

/**
 * Post-processing overlay layer (canvas-based, tier-capped rAF):
 * - Vignette (radial gradient)
 * - Bloom glow (center radial gradient)
 * - Halation (warm glow)
 * - Particles (floating luminous motes)
 *
 * Film grain is banned globally (design law) — the grain pipeline was
 * removed entirely, not just zeroed.
 */
export function PostProcessingLayer({
  chromaticAberration: _chromaticAberration,
  vignette,
  bloomIntensity,
  audioAmplitude,
  particleDensity,
  halation,
  palette,
}: PostProcessingLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  // CSS size cached by ResizeObserver — avoids per-frame layout reads
  const sizeRef = useRef({ w: 0, h: 0 });

  // Store all props in a ref — rAF loop reads from here instead of closure.
  // This prevents the effect from tearing down/recreating on every prop change.
  const propsRef = useRef({ vignette, bloomIntensity, audioAmplitude, particleDensity, halation, palette });
  propsRef.current = { vignette, bloomIntensity, audioAmplitude, particleDensity, halation, palette };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    sizeRef.current = { w: canvas.clientWidth, h: canvas.clientHeight };
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        sizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height };
      }
    });
    resizeObserver.observe(canvas);

    // Tier frame cap — mirrors the shader visualizer's cap (30fps low,
    // 45fps medium, uncapped high). Soft overlays don't need more.
    const tier = getDeviceTier();
    const minFrameMs = tier === "low" ? 1000 / 30 : tier === "medium" ? 1000 / 45 : 0;
    let lastFrameTime = 0;

    // Gradients are cached and rebuilt only when their inputs change;
    // per-frame intensity is applied via globalAlpha (identical output,
    // no per-frame CanvasGradient allocations).
    let vigGradient: CanvasGradient | null = null;
    let bloomGradient: CanvasGradient | null = null;
    let gradientSizeKey = "";
    let halGradient: CanvasGradient | null = null;
    let halKey = "";

    let lastTime = performance.now();

    function render(now: number) {
      if (!canvas || !ctx) return;

      if (minFrameMs > 0 && now - lastFrameTime < minFrameMs) {
        animRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = now;

      // Read current prop values from ref (always fresh, no effect restart needed)
      const pp = propsRef.current;

      const dt = Math.min((now - lastTime) / 1000, 0.05); // Cap at 50ms
      lastTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      const dpr = Math.min(devicePixelRatio, 1); // Cap at 1x — blurry effects don't need retina
      const targetW = Math.max(1, Math.round(sizeRef.current.w * dpr));
      const targetH = Math.max(1, Math.round(sizeRef.current.h * dpr));

      // Only resize when needed
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const sizeKey = `${w}x${h}`;
      if (gradientSizeKey !== sizeKey) {
        gradientSizeKey = sizeKey;
        vigGradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
        vigGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        vigGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
        bloomGradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
        bloomGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        bloomGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        halGradient = null; // size changed — rebuild on next use
      }

      // --- Vignette ---
      if (pp.vignette > 0.01 && vigGradient) {
        ctx.globalAlpha = pp.vignette * 0.55;
        ctx.fillStyle = vigGradient;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // --- Bloom glow ---
      if (pp.bloomIntensity > 0.2 && bloomGradient) {
        const glowAlpha = (pp.bloomIntensity - 0.2) * 0.15 * (0.5 + pp.audioAmplitude * 0.5);
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = bloomGradient;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // --- Halation (warm glow) ---
      if (pp.halation > 0.02) {
        const paletteKey = `${sizeKey}|${pp.palette.glow}|${pp.palette.accent}`;
        if (!halGradient || halKey !== paletteKey) {
          halKey = paletteKey;
          halGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.6);
          halGradient.addColorStop(0, `${hex6(pp.palette.glow)}ff`);
          halGradient.addColorStop(0.5, `${hex6(pp.palette.accent)}80`);
          halGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        }
        const halAlpha = pp.halation * 0.12 * (0.6 + pp.audioAmplitude * 0.4);
        const cx = w * (0.5 + Math.sin(t * 0.3) * 0.1);
        const cy = h * (0.5 + Math.cos(t * 0.2) * 0.1);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = halAlpha;
        ctx.fillStyle = halGradient;
        ctx.fillRect(-cx, -cy, w, h);
        ctx.restore();
      }

      // --- Particles ---
      if (pp.particleDensity > 0.02) {
        const targetCount = Math.floor(pp.particleDensity * 60);
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

        ctx.fillStyle = pp.palette.glow;

        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.life += dt;
          pt.x += pt.vx + Math.sin(t + pt.y * 0.01) * 0.3;
          pt.y += pt.vy;

          const lifeProgress = pt.life / pt.maxLife;
          if (lifeProgress < 0.2) {
            pt.alpha = lifeProgress / 0.2;
          } else if (lifeProgress > 0.8) {
            pt.alpha = (1 - lifeProgress) / 0.2;
          } else {
            pt.alpha = 1;
          }

          if (pt.life >= pt.maxLife || pt.y < -10 || pt.x < -10 || pt.x > w + 10) {
            particles.splice(i, 1);
            continue;
          }

          // Single draw call per particle (no separate glow)
          ctx.globalAlpha = pt.alpha * 0.5 * pp.particleDensity;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 3 }}
    />
  );
}
