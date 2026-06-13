/**
 * motion.ts — DeviceMotion shake onset detection
 *
 * Computes acceleration magnitude from DeviceMotionEvent,
 * applies adaptive threshold + refractory period to detect
 * discrete percussion-worthy shakes.
 *
 * Naming note: functions start with "make*" / "run*" / "apply*"
 * (never "use*") to avoid ESLint hook lint rule.
 */

export interface ShakeOnset {
  /** Normalized magnitude 0–1 (1 = very hard shake) */
  magnitude: number;
  /** Raw m/s² total acceleration magnitude */
  rawMag: number;
  /** Timestamp ms */
  timestamp: number;
}

export interface MotionDetector {
  /** Call inside a user gesture on iOS to request permission, then attach listener. */
  requestAndStart: () => Promise<"granted" | "denied" | "unsupported">;
  /** Stop listening. */
  stop: () => void;
  /** Register callback for each detected shake onset. */
  onShake: (cb: (onset: ShakeOnset) => void) => void;
  /** Whether motion events are being received. */
  readonly active: boolean;
}

/** Maximum expected acceleration magnitude (m/s²) for normalization. */
const MAG_MAX = 40;

/** Refractory period in ms between onsets (prevents double-fires). */
const REFRACTORY_MS = 80;

/** Initial onset threshold in m/s² */
const BASE_THRESHOLD = 3.5;

/** How many recent samples to keep for adaptive threshold */
const HISTORY_LEN = 60;

export function makeMotionDetector(): MotionDetector {
  let shakeCallback: ((onset: ShakeOnset) => void) | null = null;
  let isActive = false;
  let lastOnsetTime = 0;
  const recentMags: number[] = [];
  let adaptiveThreshold = BASE_THRESHOLD;
  let listenerAttached = false;

  function handleMotion(e: DeviceMotionEvent) {
    const acc = e.accelerationIncludingGravity ?? e.acceleration;
    if (!acc) return;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    const raw = Math.sqrt(x * x + y * y + z * z);

    // Remove gravity component estimate (9.8 m/s²) from magnitude
    // Use simple high-pass: compare to recent average
    recentMags.push(raw);
    if (recentMags.length > HISTORY_LEN) recentMags.shift();

    const avg = recentMags.reduce((a, b) => a + b, 0) / recentMags.length;
    // Dynamic threshold: 1.4× running average, floor at BASE_THRESHOLD
    adaptiveThreshold = Math.max(BASE_THRESHOLD, avg * 1.4);

    // Delta above baseline
    const delta = raw - avg;
    if (delta < adaptiveThreshold) return;

    const now = performance.now();
    if (now - lastOnsetTime < REFRACTORY_MS) return;
    lastOnsetTime = now;

    const magnitude = Math.min(1, delta / MAG_MAX);

    shakeCallback?.({
      magnitude,
      rawMag: raw,
      timestamp: now,
    });
  }

  async function requestAndStart(): Promise<"granted" | "denied" | "unsupported"> {
    if (typeof window === "undefined") return "unsupported";

    // iOS 13+ requires permission
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DME = DeviceMotionEvent as any;
    if (typeof DME.requestPermission === "function") {
      try {
        const result = await DME.requestPermission();
        if (result !== "granted") return "denied";
      } catch {
        return "denied";
      }
    }

    if (!("DeviceMotionEvent" in window)) return "unsupported";

    if (!listenerAttached) {
      window.addEventListener("devicemotion", handleMotion, { passive: true });
      listenerAttached = true;
    }
    isActive = true;
    return "granted";
  }

  function stop() {
    if (listenerAttached) {
      window.removeEventListener("devicemotion", handleMotion);
      listenerAttached = false;
    }
    isActive = false;
  }

  function onShake(cb: (onset: ShakeOnset) => void) {
    shakeCallback = cb;
  }

  return {
    requestAndStart,
    stop,
    onShake,
    get active() { return isActive; },
  };
}
