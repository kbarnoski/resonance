/**
 * Device performance tier detection.
 *
 * Three tiers — `high`, `medium`, `low` — drive the heavy render knobs
 * (AI image generation interval, dual-shader compositing, bloom intensity,
 * particle density, clone overlays).
 *
 * Detection philosophy: **default to `medium`**. Only promote to `high`
 * with a strong positive signal (Apple Silicon detected via the WebGL
 * renderer string). Older Intel Macs running Safari or Chrome will land
 * in `medium`. Anything that smells like mobile or very weak hardware
 * lands in `low`.
 *
 * This is intentionally conservative — false-positive `high` detections
 * caused the lag-on-old-Macs issue. Better to under-promise and let
 * users force `high` via `?tier=high` URL param than to over-promise.
 *
 * Override priority:
 *   1. `?tier=high|medium|low` URL query (this session only)
 *   2. localStorage manual override (persists across sessions)
 *   3. localStorage cached auto-detect
 *   4. fresh auto-detect (cached after first call)
 */

export type DeviceTier = "high" | "medium" | "low";

// Bumped from v1 to v2 when detection logic tightened (older v1 caches wrongly
// marked old Intel Macs as `high`). Anyone with a stale v1 entry will get a
// fresh detection run on next page load.
const STORAGE_KEY = "resonance-device-tier-v2";
const OVERRIDE_KEY = "resonance-device-tier-override";

let cachedTier: DeviceTier | null = null;
let loggedTier = false;

function isValidTier(s: unknown): s is DeviceTier {
  return s === "high" || s === "medium" || s === "low";
}

/** Read the WebGL UNMASKED_RENDERER string. Returns null if blocked or unavailable.
 *  On Apple Silicon Macs in Chrome this returns something like "Apple M1 Pro" or
 *  "ANGLE (Apple, Apple M3 Max, OpenGL 4.1)". Safari blocks this for privacy. */
function getGpuRenderer(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === "string" ? renderer : null;
  } catch {
    return null;
  }
}

function detect(): DeviceTier {
  if (typeof navigator === "undefined") return "medium"; // SSR fallback (was "high" before)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  const ua: string = nav.userAgent ?? "";

  // Mobile devices: always low (touch performance is the bigger story than CPU)
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "low";

  const cores: number | undefined = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined;
  const memory: number | undefined = typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined;

  // Strong negative signal: clearly weak hardware → low tier
  if ((cores ?? 99) <= 4) return "low";
  if ((memory ?? 99) <= 2) return "low";

  // Strong positive signal: Apple Silicon detected via GPU renderer string.
  // Only this earns the `high` tier — everything else stays at the safe medium
  // default. Users can force `high` via the URL override or settings if they
  // know their machine can handle it.
  const renderer = getGpuRenderer();
  if (renderer) {
    // "Apple M1", "Apple M2 Pro", "Apple M3 Max", "Apple M4", etc.
    if (/Apple M\d/.test(renderer)) return "high";
    // Newer NVIDIA / AMD discrete GPUs would also qualify, but we'd need
    // very specific patterns to avoid promoting weak integrated GPUs. Skip
    // for now — those users can manually override via ?tier=high.
  }

  // Default — safe middle ground that runs everywhere
  return "medium";
}

function tierFromUrlParam(): DeviceTier | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tier");
    return isValidTier(t) ? t : null;
  } catch {
    return null;
  }
}

/** Get the active tier (URL > localStorage override > cached > fresh detect). */
export function getDeviceTier(): DeviceTier {
  if (typeof window === "undefined") return "medium";

  // URL param override takes top priority — easy testing without clearing storage
  const urlTier = tierFromUrlParam();
  if (urlTier) {
    if (!loggedTier) {
      // eslint-disable-next-line no-console
      console.log(`[Resonance] Device tier: ${urlTier} (?tier= override)`);
      loggedTier = true;
    }
    return urlTier;
  }

  // Manual override (set via setDeviceTierOverride) wins next
  try {
    const override = window.localStorage.getItem(OVERRIDE_KEY);
    if (isValidTier(override)) {
      if (!loggedTier) {
        // eslint-disable-next-line no-console
        console.log(`[Resonance] Device tier: ${override} (manual override)`);
        loggedTier = true;
      }
      return override;
    }
  } catch { /* localStorage blocked */ }

  if (cachedTier) return cachedTier;

  // Cached auto-detected tier
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidTier(stored)) {
      cachedTier = stored;
      if (!loggedTier) {
        // eslint-disable-next-line no-console
        console.log(`[Resonance] Device tier: ${stored} (cached)`);
        loggedTier = true;
      }
      return stored;
    }
  } catch {}

  const detected = detect();
  cachedTier = detected;
  try { window.localStorage.setItem(STORAGE_KEY, detected); } catch {}
  if (!loggedTier) {
    // eslint-disable-next-line no-console
    console.log(`[Resonance] Device tier: ${detected} (auto-detected). Override with ?tier=high|medium|low`);
    loggedTier = true;
  }
  return detected;
}

/** Manually override the auto-detected tier. Pass `null` to clear. */
export function setDeviceTierOverride(tier: DeviceTier | null): void {
  if (typeof window === "undefined") return;
  try {
    if (tier === null) {
      window.localStorage.removeItem(OVERRIDE_KEY);
    } else {
      window.localStorage.setItem(OVERRIDE_KEY, tier);
    }
  } catch {}
}

/** Re-run detection ignoring the cache. Useful after user changes hardware
 *  or for debugging. */
export function refreshDeviceTier(): DeviceTier {
  cachedTier = null;
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  return getDeviceTier();
}

// ─── Tier multipliers / gates ───
//
// Convenience exports so the render pipeline doesn't have to know the tier
// shape — it just asks "how much bloom?" or "should I render dual shader?".

export interface TierProfile {
  /** Multiplier on AI image generation interval (8s base × this). */
  aiImageIntervalMultiplier: number;
  /** Max number of overlapping AI image layers — fewer = lighter compositor cost. */
  maxAiLayers: number;
  /** Max concurrent AI image network requests. */
  maxConcurrentAiGens: number;
  /** Whether to allow the dual-shader A/B layer at all. */
  enableDualShader: boolean;
  /** Multiplier on bloom intensity (0..1). */
  bloomScale: number;
  /** Multiplier on particle density. */
  particleScale: number;
  /** Multiplier on clone overlay density / spawn frequency. */
  cloneScale: number;
  /** Whether AI imagery is allowed at all. */
  enableAiImagery: boolean;
  /** Whether the bass-flash overlay is allowed (Ghost). */
  enableBassFlash: boolean;
}

const PROFILES: Record<DeviceTier, TierProfile> = {
  high: {
    aiImageIntervalMultiplier: 1.0,
    maxAiLayers: 6,
    // Bumped from 2 to 4: flux-pulid gens take ~8-12s, so with our 6-8s
    // gen interval we'd stall the pipeline (new gen requests blocked by
    // earlier in-flight ones). Higher concurrency keeps images flowing
    // even when any single gen is slow.
    maxConcurrentAiGens: 4,
    enableDualShader: true,
    bloomScale: 1.0,
    particleScale: 1.0,
    cloneScale: 1.0,
    enableAiImagery: true,
    enableBassFlash: true,
  },
  medium: {
    aiImageIntervalMultiplier: 1.6, // 8s -> ~13s between gens
    maxAiLayers: 4,
    maxConcurrentAiGens: 3,
    enableDualShader: true,
    bloomScale: 0.7,
    particleScale: 0.7,
    cloneScale: 0.6,
    enableAiImagery: true,
    enableBassFlash: true,
  },
  low: {
    aiImageIntervalMultiplier: 4.0, // ~32s between gens
    maxAiLayers: 2,                  // 2 overlapping images max
    maxConcurrentAiGens: 1,
    enableDualShader: false,
    bloomScale: 0.4,
    particleScale: 0.4,
    cloneScale: 0.3,
    enableAiImagery: true, // still on but slow + thin
    enableBassFlash: false,
  },
};

export function getTierProfile(): TierProfile {
  return PROFILES[getDeviceTier()];
}
