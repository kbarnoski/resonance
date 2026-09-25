"use client";

import { useEffect, useState } from "react";

/**
 * Composite-wide deband overlay (2026-09-25b). Every layer in the journey
 * composite — WebGL shaders, canvas glow gradients, JPEG stills, H.264
 * frames — quantizes to 8 bits, and slow dark gradients show visible
 * contour bands ("looks cheap and low res" — Karel, twice). The classic
 * fix is sub-perceptual dithering of the FINAL composite: one static
 * noise tile in overlay blend, amplitude ±10 levels at 14% opacity ≈
 * ±3 effective levels — invisible as texture, lethal to contours.
 *
 * This is dithering, not film grain: static (never animated), neutral-
 * gray centered, sub-perceptual. The film-grain aesthetic ban stands.
 */
export function DebandOverlay() {
  const [tileUrl, setTileUrl] = useState<string | null>(null);

  useEffect(() => {
    const t = document.createElement("canvas");
    t.width = 256;
    t.height = 256;
    const ctx = t.getContext("2d");
    if (!ctx) return;
    const id = ctx.createImageData(256, 256);
    for (let p = 0; p < id.data.length; p += 4) {
      const v = 118 + Math.floor(Math.random() * 21); // 128 ± 10
      id.data[p] = v;
      id.data[p + 1] = v;
      id.data[p + 2] = v;
      id.data[p + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    setTileUrl(t.toDataURL("image/png"));
  }, []);

  if (!tileUrl) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 4,
        backgroundImage: `url(${tileUrl})`,
        backgroundRepeat: "repeat",
        mixBlendMode: "overlay",
        opacity: 0.14,
      }}
    />
  );
}
