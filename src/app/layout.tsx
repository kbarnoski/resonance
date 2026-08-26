import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
