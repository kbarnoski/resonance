/**
 * Favicon — the Resonance branching mark on violet-black.
 *
 * Rendered at request time via next/og so the favicon is always the
 * exact same shape as `ResonanceMark` (src/components/branding).
 * At 32px the 1.5 stroke of the in-app mark disappears, so we thicken
 * to 2.4 and drop the shortest sub-branch's curvature ambiguity by
 * keeping the full four-path mark — it still reads as "signal branching
 * off a stem" at tab size.
 */
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Violet-black — the app's chrome background, one step above pure
          // black so the mark's glow reads against dark browser themes.
          backgroundColor: "#0a0714",
          borderRadius: 7,
        }}
      >
        <svg viewBox="0 0 24 24" width={25} height={25} fill="none">
          <path
            d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21"
            stroke="#d6cbff"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <path
            d="M12 7C14.5 7 16.5 5.5 16.5 3.5"
            stroke="#d6cbff"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <path
            d="M12 12C9 12 6.5 10 6.5 7.5"
            stroke="#d6cbff"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <path
            d="M12 17C15 17 17.5 15 17.5 12.5"
            stroke="#d6cbff"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
