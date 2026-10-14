import { describe, it, expect } from "vitest";
import { createVirtualClock, mulberry32 } from "./virtual-clock.mjs";
import { createSeededRandom } from "../../src/lib/journeys/seeded-random";

const run = async (clock, frames) => {
  for (let i = 0; i < frames; i++) {
    const t = clock.beginFrame();
    await clock.runTimersUntil(t);
    clock.runAnimationFrames(t);
    clock.runIdleCallbacks();
  }
};

describe("virtual clock", () => {
  it("frame times come from the integer frame index (no drift)", () => {
    const c = createVirtualClock({ fps: 60 });
    expect(c.now()).toBe(0);
    let t = 0;
    for (let i = 0; i < 3600; i++) t = c.beginFrame();
    expect(t).toBe(60000);
    expect(c.frame()).toBe(3600);
  });

  it("Date.now = epoch + virtual ms, integer", async () => {
    const c = createVirtualClock({ fps: 60, epochMs: 1000 });
    await run(c, 1);
    expect(c.dateNow()).toBe(1016);
  });

  it("time stands still until a frame is stepped", async () => {
    const c = createVirtualClock({ fps: 30 });
    let fired = false;
    c.setTimeout(() => { fired = true; }, 10);
    expect(fired).toBe(false);
    await run(c, 1);
    expect(fired).toBe(true);
  });

  it("timers fire in due order with the clock at each due time", async () => {
    const c = createVirtualClock({ fps: 60 });
    const seen = [];
    c.setTimeout(() => seen.push(["b", c.now()]), 10);
    c.setTimeout(() => seen.push(["a", c.now()]), 5);
    c.setTimeout(() => seen.push(["a2", c.now()]), 5);
    c.setTimeout(() => seen.push(["late", c.now()]), 100);
    await run(c, 1);
    expect(seen).toEqual([["a", 5], ["a2", 5], ["b", 10]]);
    expect(c.now()).toBeCloseTo(1000 / 60, 9);
    await run(c, 6);
    expect(seen[3]).toEqual(["late", 100]);
  });

  it("a self-rescheduling setTimeout(0) chain is clamped to 4 ms after 5 levels (terminates)", async () => {
    const c = createVirtualClock({ fps: 60 });
    let n = 0;
    const tick = () => { n++; c.setTimeout(tick, 0); };
    c.setTimeout(tick, 0);
    await run(c, 1);
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(12);
  });

  it("setInterval repeats; clearing inside the callback stops it", async () => {
    const c = createVirtualClock({ fps: 10 });
    const at = [];
    const id = c.setInterval(() => { at.push(c.now()); if (at.length === 3) c.clearTimer(id); }, 30);
    await run(c, 3);
    expect(at).toEqual([30, 60, 90]);
    await run(c, 3);
    expect(at.length).toBe(3);
  });

  it("rAF: timestamp = frame time; callbacks queued inside a rAF run next frame", async () => {
    const c = createVirtualClock({ fps: 50 });
    const ts = [];
    const loop = (t) => { ts.push(t); if (ts.length < 3) c.requestAnimationFrame(loop); };
    c.requestAnimationFrame(loop);
    await run(c, 5);
    expect(ts).toEqual([20, 40, 60]);
  });

  it("cancelAnimationFrame and idle callbacks", async () => {
    const c = createVirtualClock({ fps: 60 });
    let ran = 0;
    const id = c.requestAnimationFrame(() => ran++);
    c.cancelAnimationFrame(id);
    let deadline = null;
    c.requestIdleCallback((d) => { deadline = d; });
    await run(c, 1);
    expect(ran).toBe(0);
    expect(deadline.didTimeout).toBe(false);
    expect(deadline.timeRemaining()).toBeGreaterThan(0);
  });

  it("callback errors are reported, not fatal", async () => {
    const errs = [];
    const c = createVirtualClock({ fps: 60, onError: (e) => errs.push(e.message) });
    let after = false;
    c.setTimeout(() => { throw new Error("boom"); }, 1);
    c.setTimeout(() => { after = true; }, 2);
    await run(c, 1);
    expect(errs).toEqual(["boom"]);
    expect(after).toBe(true);
  });

  it("runaway guard throws loudly", async () => {
    const c = createVirtualClock({ fps: 1, maxFiringsPerFrame: 50 });
    const tick = () => c.setTimeout(tick, 5);
    c.setTimeout(tick, 5);
    const t = c.beginFrame();
    await expect(c.runTimersUntil(t)).rejects.toThrow(/runaway/);
  });

  it("awaits the `between` hook after each timer", async () => {
    const c = createVirtualClock({ fps: 60 });
    const order = [];
    c.setTimeout(() => { order.push("t1"); void Promise.resolve().then(() => order.push("micro")); }, 1);
    c.setTimeout(() => order.push("t2"), 2);
    const t = c.beginFrame();
    await c.runTimersUntil(t, async () => { await 0; await 0; });
    expect(order).toEqual(["t1", "micro", "t2"]);
  });

  it("mulberry32 matches the app's seeded-random", () => {
    const a = mulberry32(42);
    const b = createSeededRandom(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("rejects a bad fps", () => {
    expect(() => createVirtualClock({ fps: 0 })).toThrow();
  });
});
