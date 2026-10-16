import { describe, expect, it } from "vitest";
import { LIVE_PULSE, newPulse, stepPulse, type PulseState } from "./live-pulse";

const run = (s: PulseState, level: number, ms: number) => {
  let st = s;
  let change: string | null = null;
  for (let t = 0; t < ms && !change; t += 1000) {
    const r = stepPulse(st, level, 1000);
    st = r.state;
    change = r.change;
  }
  return { st, change };
};

describe("live pulse (Karel 2026-10-16: silence holds, sound engages)", () => {
  it("a quiet room (the laptop mic's hum) never changes the world", () => {
    const { change } = run(newPulse(0.085), 0.088, 10 * 60_000);
    expect(change).toBeNull();
  });
  it("about a minute of real sound brings the next world", () => {
    let { st } = run(newPulse(0.085), 0.085, 30_000);
    // steady playing well above the room — no surge, just time with sound
    st = { ...st, short: 0.16, long: 0.16 };
    const r = run(st, 0.16, 120_000);
    expect(r.change).toBe("sound");
    expect(r.st.activeMs).toBeGreaterThanOrEqual(LIVE_PULSE.ACTIVE_MS);
  });
  it("silence in between doesn't count — only sounding time runs the clock", () => {
    let st = run(newPulse(0.085), 0.085, 30_000).st;
    st = { ...st, short: 0.16, long: 0.16 };
    st = run(st, 0.16, 30_000).st;
    const quiet = run(st, 0.085, 5 * 60_000);
    expect(quiet.change).toBeNull();
    expect(quiet.st.activeMs).toBeLessThan(LIVE_PULSE.ACTIVE_MS);
  });
  it("ten minutes of continuous playing still counts as sound (the floor never learns the playing)", () => {
    let st = run(newPulse(0.085), 0.085, 30_000).st;
    st = { ...st, short: 0.16, long: 0.16 };
    let changes = 0;
    for (let i = 0; i < 600; i++) {
      const r = stepPulse(st, 0.16, 1000);
      st = r.change ? { ...r.state, activeMs: 0, sceneMs: 0 } : r.state;
      if (r.change) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(9);
  });
  it("a surge (quiet → loud) brings the next world at once — after the minimum scene", () => {
    const st = run(newPulse(0.085), 0.09, 40_000).st;
    const r = stepPulse(st, 0.4, 1000);
    const r2 = run(r.state, 0.4, 3000);
    expect(r.change ?? r2.change).toBe("surge");
  });
});
