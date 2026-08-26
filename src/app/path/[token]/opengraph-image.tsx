/**
 * Per-path Open Graph card — a Welcome Home share link unfurls with
 * the path's own title set in Cormorant italic over the white-into-gold
 * gradient the landing page uses, plus the artist credit and journey
 * count in mono. Colors follow the path's stored accent/glow (Welcome
 * Home gold by default).
 *
 * Invalid or deleted tokens fall back to the default brand card design
 * so a dead link still unfurls as Resonance, never as a broken image.
 *
 * Fonts: satori (next/og) cannot parse woff2, so static TTF instances
 * live alongside the self-hosted woff2 files in public/fonts.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isOfflinePack, getPathByShareToken } from "@/lib/offline/pack";
import { getPublicPathPayload, type PathRow, type JourneyRow } from "./path-data";

export const alt = "A path on Resonance";
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

function Mark({ color, width }: { color: string; width: number }) {
  return (
    <svg viewBox="0 0 24 24" width={width} height={width} fill="none">
      <path d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M12 7C14.5 7 16.5 5.5 16.5 3.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M12 12C9 12 6.5 10 6.5 7.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M12 17C15 17 17.5 15 17.5 12.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/** Default brand card — used when the token doesn't resolve. */
function fallbackCard(fonts: Awaited<ReturnType<typeof loadFonts>>) {
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
        <Mark color="rgba(214, 203, 255, 0.85)" width={64} />
        <div
          style={{
            marginTop: 42,
            fontFamily: "Geist Mono",
            fontSize: 21,
            letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.48)",
            paddingLeft: "0.44em",
          }}
        >
          A listening space
        </div>
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

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fonts = await loadFonts();

  let path: PathRow | null = null;
  let journeys: JourneyRow[] = [];
  try {
    if (isOfflinePack()) {
      path = getPathByShareToken(token) as unknown as PathRow | null;
    } else {
      const payload = await getPublicPathPayload(token);
      path = payload?.path ?? null;
      journeys = payload?.journeys ?? [];
    }
  } catch {
    path = null;
  }

  if (!path) return fallbackCard(fonts);

  const glow = path.glow_color ?? "#e0b080";
  const accent = path.accent_color ?? "#d0a070";
  const creator =
    journeys.find((j) => j.id === path?.journey_ids?.[0])?.creator_name ??
    "Karel Barnoski";
  const trackCount = path.journey_ids?.length ?? 0;

  // Long titles step down so nothing clips. "Welcome Home" sits at 150.
  const nameLength = path.name.length;
  const titleSize = nameLength <= 14 ? 150 : nameLength <= 24 ? 116 : 84;

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
          backgroundImage: `radial-gradient(ellipse 75% 60% at 50% 42%, ${accent}24, rgba(5, 3, 8, 0) 70%)`,
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        <Mark color={`${glow}cc`} width={56} />

        {/* Eyebrow */}
        <div
          style={{
            marginTop: 40,
            fontFamily: "Geist Mono",
            fontSize: 20,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.48)",
            paddingLeft: "0.4em",
          }}
        >
          {trackCount > 0 ? `A path · ${trackCount} journeys` : "A path"}
        </div>

        {/* Path title — white into the path's glow color, as on the landing hero */}
        <div
          style={{
            marginTop: 6,
            fontFamily: "Cormorant Garamond",
            fontStyle: "italic",
            fontSize: titleSize,
            lineHeight: 1.15,
            letterSpacing: "0.02em",
            textAlign: "center",
            backgroundImage: `linear-gradient(180deg, #ffffff 12%, ${glow} 100%)`,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {path.name}
        </div>

        {/* Hairline + credit */}
        <div
          style={{
            marginTop: 32,
            width: 72,
            height: 1,
            backgroundColor: `${accent}59`,
          }}
        />
        <div
          style={{
            marginTop: 28,
            fontFamily: "Geist Mono",
            fontSize: 18,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.42)",
            paddingLeft: "0.24em",
          }}
        >
          {`Music by ${creator}`}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
