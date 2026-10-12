import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter_Tight, Bodoni_Moda } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// HORIZON SPLIT journey titles (Karel 2026-10-12 chose option 07): a grotesk
// title + a Didone italic number. Bundled at build — the offline kiosk keeps them.
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["300"],
});
const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
});

const SITE_URL = "https://getresonance.vercel.app";
const SITE_DESCRIPTION =
  "A listening space — immersive visual journeys through original music by Karel Barnoski.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Resonance",
    template: "%s — Resonance",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "Resonance",
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: "Resonance",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Resonance",
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: "Resonance",
    statusBarStyle: "black-translucent",
  },
  other: {
    "theme-color": "#000000",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${interTight.variable} ${bodoniModa.variable} antialiased`}
      >
        {/* warm the Horizon Split title fonts at boot (load + shape + raster at
            the title size), so the first journey title never pays for them */}
        <span
          aria-hidden
          style={{ position: "fixed", left: 0, bottom: 0, opacity: 0.001, pointerEvents: "none", fontFamily: "var(--font-inter-tight)", fontWeight: 300, fontSize: "5vh", whiteSpace: "nowrap", zIndex: -1 }}
        >
          ABCDEFGHIJKLMNOPQRSTUVWXYZ <i style={{ fontFamily: "var(--font-bodoni)", fontStyle: "italic", fontWeight: 400, fontSize: "3.3vh" }}>No. 0123456789</i>
        </span>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
