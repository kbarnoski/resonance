import { describe, it, expect, vi, afterEach } from "vitest";

// Karel 2026-10-13: with the valve closed the local app makes NO live-image
// request — every client entry point returns before fetch.
describe("live imagery valve", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("closed: no request leaves the page", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_IMAGERY", "off");
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    const { getRealtimeImageService } = await import("./realtime-image-service");
    const { getAiImageService } = await import("./ai-image-service");
    const rt = getRealtimeImageService();
    expect(await rt.checkAvailability()).toBe(false);
    expect(await rt.connect()).toBe(false);
    expect(await rt.generateFrameREST({ prompt: "x", denoisingStrength: 0.5 })).toBeNull();
    expect(rt.sendFrame({ prompt: "x", denoisingStrength: 0.5 })).toBe(false);
    const ai = getAiImageService();
    expect(await ai.checkAvailability()).toBe(false);
    expect(await ai.generateFrame({ prompt: "x" } as Parameters<typeof ai.generateFrame>[0])).toBeNull();
    const { prepareGhostReference } = await import("./ghost-reference");
    await prepareGhostReference("ghost");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("open by default (the web app)", async () => {
    vi.resetModules();
    const { liveImageryOpen } = await import("./live-imagery-valve");
    expect(liveImageryOpen()).toBe(true);
  });
});
