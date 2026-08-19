/**
 * Tests for device performance tier detection and the tier → render
 * profile mapping.
 *
 * We run in Node, so window/navigator/document are stubbed per test.
 * Detection tests call refreshDeviceTier() to bypass the module-level
 * cache; profile tests use the ?tier= URL override, which always wins,
 * so no cache state can leak between tests.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

// Offline-pack probe is mocked so tests can flip "installation mode" on/off
// without a network. vi.hoisted so the state object exists before the
// hoisted vi.mock factory runs.
const packState = vi.hoisted(() => ({ active: false }));
vi.mock("@/lib/offline/pack-client", () => ({
  isPackActive: () => packState.active,
  probePack: () => {},
}));
import {
  getDeviceTier,
  refreshDeviceTier,
  setDeviceTierOverride,
  getTierProfile,
  type DeviceTier,
} from "./device-tier";

function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function stubBrowser(opts: {
  userAgent?: string;
  cores?: number;
  memory?: number;
  gpuRenderer?: string | null;
  search?: string;
  connection?: Record<string, unknown>;
} = {}) {
  const {
    userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    cores,
    memory,
    gpuRenderer = null,
    search = "",
    connection,
  } = opts;
  vi.stubGlobal("window", {
    localStorage: makeLocalStorage(),
    location: { search },
  });
  vi.stubGlobal("navigator", {
    userAgent,
    ...(cores !== undefined ? { hardwareConcurrency: cores } : {}),
    ...(memory !== undefined ? { deviceMemory: memory } : {}),
    ...(connection ? { connection } : {}),
  });
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () =>
        gpuRenderer === null
          ? null
          : {
              getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
              getParameter: () => gpuRenderer,
            },
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tier detection", () => {
  it("falls back to medium during SSR (no window)", () => {
    expect(getDeviceTier()).toBe<DeviceTier>("medium");
  });

  it("puts weak phones on low and 6+ core phones on medium", () => {
    stubBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)", cores: 4 });
    expect(refreshDeviceTier()).toBe("low");
    stubBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", cores: 6 });
    expect(refreshDeviceTier()).toBe("medium");
    stubBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)", cores: 8 });
    expect(refreshDeviceTier()).toBe("medium");
  });

  it("puts weak desktops (≤4 cores or ≤2GB memory) on low", () => {
    stubBrowser({ cores: 4, memory: 8 });
    expect(refreshDeviceTier()).toBe("low");
    stubBrowser({ cores: 8, memory: 2 });
    expect(refreshDeviceTier()).toBe("low");
  });

  it("defaults capable desktops without a strong GPU signal to medium", () => {
    stubBrowser({ cores: 8, memory: 8, gpuRenderer: null });
    expect(refreshDeviceTier()).toBe("medium");
    // Intel integrated GPU is not a promotion signal
    stubBrowser({ cores: 8, memory: 8, gpuRenderer: "Intel(R) Iris(TM) Plus Graphics 640" });
    expect(refreshDeviceTier()).toBe("medium");
  });

  it("promotes to high only on an Apple Silicon renderer string", () => {
    stubBrowser({ cores: 10, memory: 16, gpuRenderer: "ANGLE (Apple, Apple M3 Max, OpenGL 4.1)" });
    expect(refreshDeviceTier()).toBe("high");
  });

  it("?tier= URL param overrides detection; invalid values are ignored", () => {
    stubBrowser({ cores: 10, gpuRenderer: "Apple M2", search: "?tier=low" });
    expect(getDeviceTier()).toBe("low");
    stubBrowser({ cores: 8, memory: 8, search: "?tier=ultra" });
    expect(refreshDeviceTier()).toBe("medium");
  });

  it("manual localStorage override wins over auto-detect and clears with null", () => {
    stubBrowser({ cores: 8, memory: 8 });
    setDeviceTierOverride("high");
    expect(getDeviceTier()).toBe("high");
    setDeviceTierOverride(null);
    expect(refreshDeviceTier()).toBe("medium");
  });
});

describe("getTierProfile", () => {
  it("low tier disables dual shader and thins AI layers", () => {
    stubBrowser({ search: "?tier=low" });
    const p = getTierProfile();
    expect(p.enableDualShader).toBe(false);
    expect(p.maxAiLayers).toBe(2);
    expect(p.maxConcurrentAiGens).toBe(1);
    // Mobile users explicitly asked to keep the Ghost bass flash
    expect(p.enableBassFlash).toBe(true);
  });

  it("high tier gets the full profile on a fast connection", () => {
    stubBrowser({ search: "?tier=high", connection: { effectiveType: "4g", downlink: 20 } });
    const p = getTierProfile();
    expect(p.maxAiLayers).toBe(8);
    expect(p.enableDualShader).toBe(true);
    expect(p.bloomScale).toBe(1.0);
  });

  it("a slow connection downgrades layers, concurrency, and gen cadence", () => {
    stubBrowser({ search: "?tier=medium", connection: { saveData: true } });
    const p = getTierProfile();
    expect(p.maxAiLayers).toBe(2); // 4 - 2
    expect(p.maxConcurrentAiGens).toBe(2); // 3 - 1
    expect(p.aiImageIntervalMultiplier).toBeCloseTo(1.6 * 1.5, 6);
  });

  it("slow-connection downgrade never drops below one layer/one request", () => {
    stubBrowser({ search: "?tier=low", connection: { effectiveType: "2g" } });
    const p = getTierProfile();
    expect(p.maxAiLayers).toBe(1); // max(1, 2 - 2)
    expect(p.maxConcurrentAiGens).toBe(1);
  });
});

describe("offline pack installation override", () => {
  afterEach(() => {
    packState.active = false;
  });

  it("forces high tier even on weak hardware when the pack is active", () => {
    stubBrowser({ cores: 4, memory: 2 }); // would normally detect low
    packState.active = true;
    expect(getDeviceTier()).toBe("high");
  });

  it("boosted installation profile ignores the connection downgrade", () => {
    // Dead kiosk network reads as slow — must NOT thin the visuals
    stubBrowser({ search: "?tier=low", connection: { saveData: true } });
    packState.active = true;
    const p = getTierProfile();
    expect(p.maxAiLayers).toBe(12);
    expect(p.maxConcurrentAiGens).toBe(6);
    expect(p.aiImageIntervalMultiplier).toBeLessThan(1);
    expect(p.enableDualShader).toBe(true);
    expect(p.bloomScale).toBe(1.0);
  });
});
