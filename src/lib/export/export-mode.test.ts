import { describe, it, expect, afterEach, vi } from "vitest";
import { isExportMode, resetExportModeCache } from "./export-mode";
import { imageryDprCeil } from "@/lib/journeys/kinetic";

function stubWindow(search: string, stored: Record<string, string> = {}) {
  const store = { ...stored };
  vi.stubGlobal("window", {
    location: { search },
    sessionStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetExportModeCache();
});

describe("export mode gate (?export=1)", () => {
  it("off on the server and on a normal page", () => {
    expect(isExportMode()).toBe(false);
    stubWindow("?loop=1&lab=1");
    resetExportModeCache();
    expect(isExportMode()).toBe(false);
  });

  it("on with ?export=1, and survives the loop dropping the query (sessionStorage)", () => {
    const store = stubWindow("?loop=1&export=1");
    expect(isExportMode()).toBe(true);
    expect(store["resonance-export"]).toBe("1");
    resetExportModeCache();
    stubWindow("?loop=1", store);
    expect(isExportMode()).toBe(true);
  });

  it("lifts the imagery DPR ceiling only in export mode", () => {
    stubWindow("?loop=1");
    expect(imageryDprCeil(1920, 1080, null, 2)).toBe(1.5); // 8.3 Mpx > realtime budget
    resetExportModeCache();
    stubWindow("?export=1");
    expect(imageryDprCeil(1920, 1080, null, 2)).toBe(2);
    expect(imageryDprCeil(1920, 1080, { id: "ghost" }, 2)).toBe(2);
  });
});
