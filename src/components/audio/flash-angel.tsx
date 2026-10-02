"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { getGhostFlashUrl } from "@/lib/journeys/ghost-flash-images";
import { glitchRecord } from "@/lib/journeys/glitch-recorder";

interface FlashAngelProps {
  /** 0-1 fade opacity. Applied on the canvas directly. */
  opacity: number;
  /** Blur radius in px, applied via CSS filter. */
  blurPx: number;
  /** Which variant to show. 0 = dark possessed angel (flash #1 only),
   *  1 = white angel (flash #2 and all subsequent flashes). */
  variant: 0 | 1;
}

/**
 * Ghost bass-hit flash overlay — the only moment in the Ghost journey where
 * the figure's face is shown directly.
 *
 * Uses client-side luminance chroma-keying: the image is drawn onto a canvas
 * and each pixel's alpha is derived from its brightness. Black pixels become
 * fully transparent; near-black pixels fade in over a narrow window so the
 * figure's edges blend cleanly into whatever shader backdrop is behind. This
 * is more reliable than mix-blend-mode: screen, which was getting isolated
 * by ancestor stacking contexts AND couldn't handle fal.ai's JPEG near-black
 * (RGB 5,5,5) artifacts.
 */
const FALLBACK_SRC = "/images/ghost-flash-angel.png"; // baked canon-consistent angel (2026-10-01)

// Keyed-canvas cache (Karel 2026-10-01: "the angel needs to come in at
// same time as the white flash"). Keying used to start when FlashAngel
// mounted — i.e. AT the hit — so image load + the per-pixel pass put the
// angel visibly behind the white flash. The compositor now warms both
// variants during the approach ramp, and a mount draws the finished
// canvas synchronously (layout effect, before first paint).
const keyed = new Map<string, HTMLCanvasElement>();
const keying = new Map<string, Promise<HTMLCanvasElement | null>>();

function keyImage(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);

  // Luminance chroma-key with a wide smoothstep falloff + a radial
  // vignette so the figure fades at the image edges. Together these
  // two curves eliminate the "pasted cut-out" look: dark areas go
  // transparent gradually, not at a hard threshold, and whatever
  // reaches the outer edge of the frame fades to nothing regardless
  // of its brightness.
  const BLACK_THRESHOLD = 6;    // lum below this → fully transparent
  const FALLOFF_END = 130;      // lum above this → fully opaque
  const FALLOFF_RANGE = FALLOFF_END - BLACK_THRESHOLD;
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    // Max distance from center to corner — normalizer for the vignette.
    const maxDist = Math.hypot(cx, cy);
    // Vignette starts fading at 78% of the radius and reaches zero at 100%.
    const VIGNETTE_INNER = 0.78;
    const VIGNETTE_RANGE = 1.0 - VIGNETTE_INNER;
    for (let i = 0; i < px.length; i += 4) {
      const p = i >> 2;
      const x = p % w;
      const y = (p - x) / w;

      // Luminance → alpha (smoothstep for natural rolloff).
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      let lumAlpha: number;
      if (lum <= BLACK_THRESHOLD) {
        lumAlpha = 0;
      } else if (lum >= FALLOFF_END) {
        lumAlpha = 1;
      } else {
        const t = (lum - BLACK_THRESHOLD) / FALLOFF_RANGE;
        lumAlpha = t * t * (3 - 2 * t);
      }

      // Radial vignette — 1 at center, 0 outside VIGNETTE_INNER*radius.
      const dist = Math.hypot(x - cx, y - cy) / maxDist;
      let vignette: number;
      if (dist <= VIGNETTE_INNER) {
        vignette = 1;
      } else if (dist >= 1.0) {
        vignette = 0;
      } else {
        const v = 1 - (dist - VIGNETTE_INNER) / VIGNETTE_RANGE;
        vignette = v * v * (3 - 2 * v);
      }

      px[i + 3] = Math.round(lumAlpha * vignette * 255);
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    // Tainted canvas (CORS). Leave the raw image drawn — at worst we
    // get the old rectangular look, but the static PNG fallback doesn't
    // suffer CORS issues so this is only a problem for fal.ai outputs
    // without CORS headers.
  }
  return canvas;
}

/** Load + key an angel image ahead of its flash. Idempotent per src. */
export function warmFlashAngel(src: string): Promise<HTMLCanvasElement | null> {
  const pending = keying.get(src);
  if (pending) return pending;
  const p = new Promise<HTMLCanvasElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = keyImage(img);
      keyed.set(src, c);
      resolve(c);
    };
    img.onerror = () => {
      keying.delete(src); // allow a retry on the next warm
      resolve(null);
    };
    img.src = src;
  });
  keying.set(src, p);
  return p;
}

/** The src a FlashAngel of this variant would show right now. */
export function flashAngelSrc(variant: 0 | 1): string {
  return getGhostFlashUrl(variant) ?? FALLBACK_SRC;
}

export const FlashAngel = memo(function FlashAngel({ opacity, blurPx, variant }: FlashAngelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ONE image per flash (Karel 2026-09-28: the second flash showed two
  // different angels in quick succession — the old code mounted with
  // the fallback and then swapped in the cached image mid-flash via a
  // 500ms poll). The src is resolved exactly once per mount: prefer an
  // image that is already keyed so the angel lands on the flash frame.
  const [src] = useState<string>(() => {
    const preferred = flashAngelSrc(variant);
    if (keyed.has(preferred) || !keyed.has(FALLBACK_SRC)) return preferred;
    return FALLBACK_SRC;
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const mountedAt = performance.now();
    const paint = (source: HTMLCanvasElement | null) => {
      if (cancelled || !source) return;
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d")?.drawImage(source, 0, 0);
      // Flight recorder: 0ms = painted with the flash; anything more is
      // the angel trailing the white flash.
      glitchRecord("angel-paint", `v${variant} ${Math.round(performance.now() - mountedAt)}ms ${src === FALLBACK_SRC ? "fallback" : "generated"}`);
    };
    const ready = keyed.get(src);
    if (ready) paint(ready);
    else void warmFlashAngel(src).then(paint);
    return () => {
      cancelled = true;
    };
  }, [src, variant]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "75vmin",
        height: "95vmin",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        opacity,
        // Baseline 0.8px blur always on so the per-pixel alpha steps never
        // read as jagged edges; motion blur stacks on top when the flash
        // is mid-fade.
        filter: `blur(${0.8 + blurPx}px)`,
      }}
      aria-hidden="true"
    />
  );
});
