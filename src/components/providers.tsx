"use client";

import { ThemeProvider } from "next-themes";
import { AudioProvider } from "@/lib/audio/audio-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <AudioProvider>
        {children}
      </AudioProvider>
    </ThemeProvider>
  );
}
