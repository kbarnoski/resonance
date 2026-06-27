// Shake-onset detection from DeviceMotionEvent.accelerationIncludingGravity.
// INPUT IS SHAKE, NOT TILT: we subtract a slow gravity baseline (low-pass),
// compute jerk magnitude, and detect threshold crossings with a refractory
// period. Peak magnitude -> shake intensity (0..1).
//
// NOTE: there is no real accelerometer in the build container, so these
// thresholds are *reasoned*, not measured. They WANT real-device tuning.
// ---------------------------------------------------------------------------

// --- Tunable constants (NEEDS REAL-DEVICE TUNING) ---
// Acceleration magnitude (m/s^2) above the gravity baseline that counts as the
// start of a shake. A brisk wrist flick on a phone peaks well above this.
export const SHAKE_THRESHOLD = 11.0;
// Magnitude that maps to full intensity (1.0). A vigorous kid shake.
export const SHAKE_FULL = 34.0;
// Minimum time between detected shakes (ms) — debounce / refractory.
export const SHAKE_REFRACTORY_MS = 150;
// Gravity baseline low-pass smoothing (0..1, higher = slower baseline).
export const GRAVITY_SMOOTH = 0.9;
// Overall sensitivity multiplier (UI-tunable on a real device).
export const SHAKE_SENSITIVITY = 1.0;

export interface ShakeDetector {
  attach: () => void;
  detach: () => void;
  // True if the platform required permission and it was denied/unavailable.
  isDenied: () => boolean;
  needsPermission: boolean;
}

interface DeviceMotionEventiOS {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export function supportsDeviceMotion(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

export function needsMotionPermission(): boolean {
  if (typeof window === "undefined") return false;
  const dme = window.DeviceMotionEvent as unknown as DeviceMotionEventiOS;
  return typeof dme?.requestPermission === "function";
}

// Call this SYNCHRONOUSLY from inside the Start tap handler (iOS 13+ rule).
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const dme = window.DeviceMotionEvent as unknown as DeviceMotionEventiOS;
  if (typeof dme?.requestPermission !== "function") return true; // no gate
  try {
    const res = await dme.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

// onShake receives intensity 0..1.
export function makeShakeDetector(onShake: (intensity: number) => void): ShakeDetector {
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let primed = false;
  let lastShakeAt = 0;
  let lastMag = 0;
  let denied = false;
  let attached = false;

  function handle(e: DeviceMotionEvent): void {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) {
      denied = true;
      return;
    }
    denied = false;
    // Low-pass to estimate the slowly-varying gravity vector.
    gx = GRAVITY_SMOOTH * gx + (1 - GRAVITY_SMOOTH) * a.x;
    gy = GRAVITY_SMOOTH * gy + (1 - GRAVITY_SMOOTH) * a.y;
    gz = GRAVITY_SMOOTH * gz + (1 - GRAVITY_SMOOTH) * a.z;
    if (!primed) {
      primed = true;
      return; // let the baseline settle one frame
    }
    // High-passed (gravity-removed) linear acceleration.
    const lx = a.x - gx;
    const ly = a.y - gy;
    const lz = a.z - gz;
    const mag = Math.sqrt(lx * lx + ly * ly + lz * lz) * SHAKE_SENSITIVITY;

    const now = performance.now();
    const rising = mag > lastMag;
    lastMag = mag;

    if (
      mag > SHAKE_THRESHOLD &&
      !rising && // fire just after the peak
      now - lastShakeAt > SHAKE_REFRACTORY_MS
    ) {
      lastShakeAt = now;
      const intensity = Math.max(
        0.18,
        Math.min(1, (mag - SHAKE_THRESHOLD) / (SHAKE_FULL - SHAKE_THRESHOLD)),
      );
      onShake(intensity);
    }
  }

  return {
    needsPermission: needsMotionPermission(),
    attach() {
      if (attached || !supportsDeviceMotion()) {
        if (!supportsDeviceMotion()) denied = true;
        return;
      }
      window.addEventListener("devicemotion", handle);
      attached = true;
    },
    detach() {
      if (!attached) return;
      window.removeEventListener("devicemotion", handle);
      attached = false;
    },
    isDenied: () => denied,
  };
}
