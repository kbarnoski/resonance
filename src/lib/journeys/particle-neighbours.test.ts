import { describe, expect, it } from "vitest";
import { replayLoop, shares } from "./loop-replay";

// NEIGHBOURS (Karel 2026-10-12: "make sure you arent lazily repeating … like we
// have done with shaders with diversity and ensuring neighboring journeys dont
// over do reuse"). Before the rule: 98 % of neighbouring journeys shared a form
// (4.8 forms on average); with it: ~2 % (0.05).
describe("particle forms — neighbouring journeys never reuse", () => {
  const logs = replayLoop(undefined, 2);
  it("≤ 10 % of neighbouring journeys share any form", () => {
    let pairs = 0, shared = 0;
    for (let i = 1; i < logs.length; i++) {
      const a = new Set(logs[i - 1].forms.map((f) => f.soul));
      if (logs[i].forms.some((f) => a.has(f.soul))) shared++;
      pairs++;
    }
    expect(shared / pairs).toBeLessThanOrEqual(0.1);
  });
  it("no form holds more than 6 % of on-screen time", () => {
    for (const [soul, v] of shares(logs)) expect(v, soul).toBeLessThanOrEqual(0.06);
  });
});
