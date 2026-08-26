/**
 * Default Open Graph card — every route without its own og image
 * (studio, journeys, the Room) unfurls with this.
 *
 * Near-black field with a low violet radial glow, the mark, a mono
 * eyebrow, and "Resonance" set in Cormorant Garamond italic with the
 * app's white-into-violet title gradient. Understated on purpose —
 * it should feel like the door to a gallery, not a banner ad.
 *
 * Fonts: satori (next/og) cannot parse woff2, so static TTF instances
 * live alongside the self-hosted woff2 files in public/fonts.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Resonance — a listening space";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadFonts() {
  const [cormorant, mono] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/cormorant-garamond-latin-italic-500.ttf")),
    readFile(join(process.cwd(), "public/fonts/geist-mono-latin-400.ttf")),
  ]);
  return [
    { name: "Cormorant Garamond", data: cormorant, style: "italic" as const, weight: 500 as const },
    { name: "Geist Mono", data: mono, style: "normal" as const, weight: 400 as const },
  ];
}

export default async function Image() {
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#050308",
          backgroundImage:
            "radial-gradient(ellipse 75% 60% at 50% 42%, rgba(124, 92, 246, 0.16), rgba(5, 3, 8, 0) 70%)",
        }}
      >
        {/* The mark */}
        <svg viewBox="0 0 24 24" width={64} height={64} fill="none">
          <path d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21" stroke="rgba(214, 203, 255, 0.85)" strokeWidth={1.5} strokeLinecap="round" />
          <path d="M12 7C14.5 7 16.5 5.5 16.5 3.5" stroke="rgba(214, 203, 255, 0.85)" strokeWidth={1.5} strokeLinecap="round" />
          <path d="M12 12C9 12 6.5 10 6.5 7.5" stroke="rgba(214, 203, 255, 0.85)" strokeWidth={1.5} strokeLinecap="round" />
          <path d="M12 17C15 17 17.5 15 17.5 12.5" stroke="rgba(214, 203, 255, 0.85)" strokeWidth={1.5} strokeLinecap="round" />
        </svg>

        {/* Eyebrow */}
        <div
          style={{
            marginTop: 42,
            fontFamily: "Geist Mono",
            fontSize: 21,
            letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.48)",
            // Compensate letter-spacing trailing gap so the line sits centered
            paddingLeft: "0.44em",
          }}
        >
          A listening space
        </div>

        {/* Title */}
        <div
          style={{
            marginTop: 4,
            fontFamily: "Cormorant Garamond",
            fontStyle: "italic",
            fontSize: 172,
            lineHeight: 1.15,
            letterSpacing: "0.02em",
            backgroundImage: "linear-gradient(180deg, #ffffff 18%, #b3a1f2 100%)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Resonance
        </div>

        {/* Hairline + credit */}
        <div
          style={{
            marginTop: 30,
            width: 72,
            height: 1,
            backgroundColor: "rgba(255, 255, 255, 0.18)",
          }}
        />
        <div
          style={{
            marginTop: 28,
            fontFamily: "Geist Mono",
            fontSize: 17,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.35)",
            paddingLeft: "0.24em",
          }}
        >
          Music by Karel Barnoski
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
