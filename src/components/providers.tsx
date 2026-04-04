"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { AudioProvider } from "@/lib/audio/audio-provider";
import { isIOSApp } from "@/lib/capacitor";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isIOSApp()) {
      import("@capacitor/splash-screen").then(({ SplashScreen }) => {
        SplashScreen.hide();
      });
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <AudioProvider>
        {children}
      </AudioProvider>
    </ThemeProvider>
  );
}
