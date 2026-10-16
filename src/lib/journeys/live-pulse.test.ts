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
  it("ten minutes of playing (with the gaps any playing has) keeps counting as sound", () => {
    let st = run(newPulse(0.085), 0.085, 30_000).st;
    let changes = 0;
    for (let i = 0; i < 600; i++) {
      const lvl = i % 20 === 0 ? 0.095 : 0.16; // a breath every 20 s
      const r = stepPulse(st, lvl, 1000);
      st = r.change ? { ...r.state, activeMs: 0, sceneMs: 0 } : r.state;
      if (r.change) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(8);
  });
  it("a mic that reads 0 before it goes live never becomes the floor", () => {
    let st = newPulse(0);
    st = run(st, 0, 3000).st;
    st = run(st, 0.1, 5000).st;
    expect(st.floor).toBeGreaterThan(0.09);
  });
  it("a surge (quiet → loud) brings the next world at once — after the minimum scene", () => {
    const st = run(newPulse(0.085), 0.09, 40_000).st;
    const r = stepPulse(st, 0.4, 1000);
    const r2 = run(r.state, 0.4, 3000);
    expect(r.change ?? r2.change).toBe("surge");
  });
});

import { conductStep, conductTarget } from "./live-pulse";
describe("live conductor (Karel: really strong responses)", () => {
  it("room hum = 0, a strong voice = full; rises fast, settles slower", () => {
    const room = newPulse(0.085);
    expect(conductTarget(room)).toBe(0);
    expect(conductTarget({ ...room, short: 0.3 })).toBe(1);
    const up = conductStep(0, 1, 400);
    const down = 1 - conductStep(1, 0, 400);
    expect(up).toBeGreaterThan(0.6);
    expect(down).toBeLessThan(0.2);
  });
});
