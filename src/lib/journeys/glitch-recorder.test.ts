import { describe, expect, it, vi } from "vitest";

// Regression (2026-10-09): the ring trim left the upload cursor pinned at
// BUFFER_MAX, so a kiosk session stopped logging after ~3000 events.
describe("glitch recorder upload cursor", () => {
  it("keeps uploading every new event after the ring buffer wraps", async () => {
    const posted: { type: string; detail?: string }[] = [];
    vi.stubGlobal("window", { addEventListener: () => {} });
    vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "visible" });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("setInterval", () => 0);
    let fail = false;
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      if (fail) return { status: 503 };
      posted.push(...JSON.parse(init.body).events);
      return { status: 200 };
    });
    const { glitchRecord, glitchFlush } = await import("./glitch-recorder");
    const flush = async () => { glitchFlush("test"); await new Promise((r) => setTimeout(r, 0)); };

    for (let i = 0; i < 2500; i++) glitchRecord("a", String(i));
    await flush();
    expect(posted.length).toBe(2500);

    for (let i = 0; i < 2000; i++) glitchRecord("b", String(i)); // wraps the 3000 ring
    await flush();
    expect(posted.length).toBe(4500);
    expect(posted.at(-1)?.detail).toBe("1999");

    fail = true; // server restarting: events kept for the next flush
    for (let i = 0; i < 10; i++) glitchRecord("c", String(i));
    await flush();
    fail = false;
    glitchRecord("d");
    await flush();
    expect(posted.slice(4500).map((e) => e.type).join("")).toBe("cccccccccc" + "d");

    fail = true; // an outage longer than the ring keeps the newest 3000
    for (let i = 0; i < 5000; i++) glitchRecord("e", String(i));
    await flush();
    fail = false;
    await flush();
    expect(posted.length).toBe(4511 + 3000);
    expect(posted.at(-1)?.detail).toBe("4999");
    vi.unstubAllGlobals();
  });
});
