/**
 * Apple touch icon — the Resonance mark on pure black.
 *
 * iOS applies its own superellipse mask and never shows transparency,
 * so this is a full-bleed pure-black tile (#000 — the same void the
 * Room projects onto) with the mark centered at a home-screen-legible
 * weight. Same four paths as `ResonanceMark`.
 */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
        }}
      >
        <svg viewBox="0 0 24 24" width={112} height={112} fill="none">
          <path
            d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21"
            stroke="#d6cbff"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <path
            d="M12 7C14.5 7 16.5 5.5 16.5 3.5"
            stroke="#d6cbff"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <path
            d="M12 12C9 12 6.5 10 6.5 7.5"
            stroke="#d6cbff"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <path
            d="M12 17C15 17 17.5 15 17.5 12.5"
            stroke="#d6cbff"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
