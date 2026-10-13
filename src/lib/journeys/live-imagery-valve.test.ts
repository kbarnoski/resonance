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

  it("closed on the local app even when the build flag is missing (lab 2026-10-13: 7× 503)", async () => {
    vi.resetModules();
    vi.stubGlobal("document", { querySelector: (sel: string) => (sel.includes("data-resonance-no-live-imagery") ? {} : null) });
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    const { liveImageryOpen } = await import("./live-imagery-valve");
    expect(liveImageryOpen()).toBe(false);
    const { getRealtimeImageService } = await import("./realtime-image-service");
    expect(await getRealtimeImageService().checkAvailability()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("closed once the offline-pack probe confirms the local pack", async () => {
    vi.resetModules();
    vi.doMock("@/lib/offline/pack-client", () => ({ isPackActive: () => true }));
    const { liveImageryOpen } = await import("./live-imagery-valve");
    expect(liveImageryOpen()).toBe(false);
    vi.doUnmock("@/lib/offline/pack-client");
  });

  it("NEXT_PUBLIC_LIVE_IMAGERY=on reopens it, even on the local app", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIVE_IMAGERY", "on");
    vi.resetModules();
    vi.stubGlobal("document", { querySelector: () => ({}) });
    const { liveImageryOpen } = await import("./live-imagery-valve");
    expect(liveImageryOpen()).toBe(true);
  });

  it("open by default (the web app)", async () => {
    vi.resetModules();
    const { liveImageryOpen } = await import("./live-imagery-valve");
    expect(liveImageryOpen()).toBe(true);
  });
});
