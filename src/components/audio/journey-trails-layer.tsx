"use client";

import { useEffect, useRef } from "react";
import { getDeviceTier } from "@/lib/audio/device-tier";

/**
 * Feedback-trails layer (2026-09-25 frontier pilot) — the TouchDesigner
 * idiom: every frame the live composite is drawn into a persistent
 * buffer that never fully clears, so light leaves slow luminous echoes.
 * Motion becomes calligraphy; stillness stays still.
 *
 * Implementation: a half-resolution canvas that (1) decays its own
 * history with a destination-out wash, (2) accumulates the current
 * shader + AI canvases with `lighter` at low alpha. The element itself
 * composites in screen blend so trails only ever ADD light — meditative
 * by construction, and dark frames leave no smear.
 *
 * Cost: 2-4 half-res drawImage calls at 30fps. Gated to high /
 * installation tiers; renders nothing elsewhere.
 */
export function JourneyTrailsLayer({
  enabled,
  intensity = 0.5,
}: {
  enabled: boolean;
  intensity?: number; // 0-1 → element opacity
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const tier = getDeviceTier();
    if (!enabled || (tier !== "high")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SCALE = 0.5; // half-res buffer — echoes are soft by nature
    const FPS_MS = 1000 / 30;
    const DECAY = 0.07; // faster history erase — white-heavy journeys were hazing over shaders (Karel 2026-09-26) // per-frame history erase — ~1.2s visible tail
    const FEED = 0.15; // per-frame accumulation of the live composite
    let last = 0;

    function render(now: number) {
      animRef.current = requestAnimationFrame(render);
      if (!canvas || !ctx) return;
      if (now - last < FPS_MS) return;
      last = now;

      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // 1) decay history
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = DECAY;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // 2) feed the live composite (sibling canvases in the compositor)
      const parent = canvas.parentElement;
      if (parent) {
        // Only 2D-canvas sources marked data-trail-src — WebGL canvases with
        // preserveDrawingBuffer:false read back blank, which is why the
        // first pass was nearly invisible (Karel: "not sure I noticed").
        const sources = parent.querySelectorAll<HTMLCanvasElement>(
          "canvas[data-trail-src]"
        );
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = FEED;
        for (const src of sources) {
          if (src.width === 0 || src.height === 0) continue;
          try {
            ctx.drawImage(src, 0, 0, w, h);
          } catch {
            /* a source mid-teardown — skip this frame */
          }
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      data-trails="1"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        zIndex: 2,
        mixBlendMode: "screen",
        opacity: Math.max(0, Math.min(1, intensity)),
      }}
    />
  );
}
