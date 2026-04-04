import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.resonance.ios",
  appName: "Resonance",
  webDir: "public",
  server: {
    url: "https://getresonance.vercel.app",
    cleartext: false,
  },
  ios: {
    scheme: "Resonance",
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
    },
  },
};

export default config;
