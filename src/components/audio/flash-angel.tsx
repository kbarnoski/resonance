"use client";

import { memo } from "react";

const ANGEL_IMAGES = [
  "/images/flash-angel-1.png",
  "/images/flash-angel-2.png",
];

interface FlashAngelProps {
  variant: 0 | 1;
}

export const FlashAngel = memo(function FlashAngel({ variant }: FlashAngelProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ANGEL_IMAGES[variant]}
      alt=""
      style={{
        width: "75vmin",
        height: "95vmin",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      }}
    />
  );
});
