"use client";

import { memo, useEffect, useState } from "react";
import { getGhostFlashUrl } from "@/lib/journeys/ghost-flash-images";

interface FlashAngelProps {
  variant: number;
}

/**
 * Ghost bass-hit flash overlay — the only moment in the Ghost journey where
 * the figure's face is shown directly. Consumes images from the Ghost
 * flash-image pool when available, falls back to the static PNG otherwise.
 */
export const FlashAngel = memo(function FlashAngel({ variant }: FlashAngelProps) {
  const [src, setSrc] = useState<string>("/images/flash-angel-1.png");

  useEffect(() => {
    const cached = getGhostFlashUrl(variant);
    if (cached) {
      setSrc(cached);
      return;
    }
    // If images aren't ready yet, retry a couple times as the pool populates
    let cancelled = false;
    let tries = 0;
    const id = setInterval(() => {
      if (cancelled) return;
      tries++;
      const url = getGhostFlashUrl(variant);
      if (url) {
        setSrc(url);
        clearInterval(id);
      } else if (tries > 10) {
        clearInterval(id);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [variant]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{
        width: "75vmin",
        height: "95vmin",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        // Screen blend makes pure-black pixels transparent, so only the bright
        // figure (rim-lit against the dark background in the flash prompt)
        // emerges through the flash. The dark background silently drops out.
        mixBlendMode: "screen",
      }}
    />
  );
});
