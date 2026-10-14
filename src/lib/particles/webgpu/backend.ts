// ─────────────────────────────────────────────────────────────────────────────
// backend.ts — which particle engine runs: WebGL2 (the show) or WebGPU.
//
// WebGPU is the DEFAULT (2026-10-14, certified on the kiosk GPU — plan §8b);
// `?gpu=webgl2` keeps the WebGL2 engine. Fallback to WebGL2 whenever
// navigator.gpu is missing or the adapter probe fails. The probe must happen BEFORE the canvas is touched:
// a canvas that has handed out a "webgpu" context can never give a "webgl2"
// one, so the decision is made on a probed adapter, never by trying.
//
// shared-engine.ts primes the probe at import and upgrades in place (plan §3.2).
// ─────────────────────────────────────────────────────────────────────────────

import { createParticleEngine, type ParticleEngine, type ParticleEngineOptions } from "../particle-engine";
import { navigatorGpu, type WAdapter } from "./gpu-types";
import type { WebGPUEngineOptions } from "./engine";
import { createPortedParticleEngine } from "./engine-port";

export type ParticleBackend = "webgl2" | "webgpu";

/** WebGPU is the default (2026-10-13); WebGL2 is the fallback and the override. */
export const WEBGPU_DEFAULT = true;

/** The backend the URL asks for: `?gpu=webgl2` → webgl2, `?gpu=webgpu` → webgpu,
 *  otherwise the default. */
export function requestedParticleBackend(search?: string): ParticleBackend {
  try {
    const g = new URLSearchParams(search ?? (typeof location !== "undefined" ? location.search : "")).get("gpu");
    if (g === "webgl2") return "webgl2";
    if (g === "webgpu") return "webgpu";
  } catch { /* default */ }
  return WEBGPU_DEFAULT ? "webgpu" : "webgl2";
}

export interface WebGPUProbe {
  available: boolean;
  /** why not (no navigator.gpu, no adapter, too-small limits) */
  why?: string;
  adapter?: WAdapter;
  maxStorageBufferBindingSize?: number;
  timestamps?: boolean;
}

/** Minimum the engine needs: 4,096 motes × 16 B per stream — any WebGPU device. */
const MIN_STORAGE_BYTES = 4096 * 16;

let probeP: Promise<WebGPUProbe> | null = null;

/** Probe once per session (cached). Never touches a canvas. */
export function probeWebGPU(): Promise<WebGPUProbe> {
  probeP ??= (async (): Promise<WebGPUProbe> => {
    const gpu = navigatorGpu();
    if (!gpu) return { available: false, why: "navigator.gpu missing" };
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return { available: false, why: "no adapter" };
      if (adapter.limits.maxStorageBufferBindingSize < MIN_STORAGE_BYTES) return { available: false, why: "storage limit too small" };
      return {
        available: true,
        adapter,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        timestamps: adapter.features.has("timestamp-query"),
      };
    } catch (e) {
      return { available: false, why: e instanceof Error ? e.message : String(e) };
    }
  })();
  return probeP;
}

/** test hook */
export function __resetWebGPUProbeForTest(): void {
  probeP = null;
}

/** Pure decision: what to run, and why. */
export function chooseParticleBackend(requested: ParticleBackend, probe: Pick<WebGPUProbe, "available" | "why"> | null): { backend: ParticleBackend; why: string } {
  if (requested !== "webgpu") return { backend: "webgl2", why: "?gpu=webgl2" };
  if (!probe) return { backend: "webgl2", why: "webgpu requested but not probed yet" };
  if (!probe.available) return { backend: "webgl2", why: `webgpu requested, falling back: ${probe.why ?? "unavailable"}` };
  return { backend: "webgpu", why: "webgpu requested and available" };
}

/** Create the engine for a decided backend. With `webgpu`, the probed adapter
 *  is handed over (an adapter is consumed by its first requestDevice; the
 *  cached probe is cleared so a later engine probes afresh). */
export function createParticleEngineFor(
  canvas: HTMLCanvasElement,
  opts: ParticleEngineOptions & Pick<WebGPUEngineOptions, "gpuTiming" | "minPx" | "onReady" | "onGpuFailure">,
  backend: ParticleBackend,
  probe?: WebGPUProbe | null,
): ParticleEngine {
  if (backend === "webgpu") {
    const adapter = probe?.adapter ?? null;
    if (adapter) probeP = null;
    // the PARITY engine: the show engine conducts, the ported passes run on WebGPU
    return createPortedParticleEngine(canvas, { ...opts, adapter });
  }
  return createParticleEngine(canvas, opts);
}
