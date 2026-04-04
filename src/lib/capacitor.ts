/**
 * Capacitor bridge — iOS native capabilities with browser fallbacks.
 * Mirrors the pattern in tauri.ts.
 */

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export function isIOSApp(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.Capacitor?.isNativePlatform?.()
  );
}

/** True when running inside any native shell (Tauri desktop or Capacitor iOS). */
export function isNativeApp(): boolean {
  // Avoid importing tauri.ts to prevent pulling in @tauri-apps/api in iOS builds
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return isTauri || isIOSApp();
}
