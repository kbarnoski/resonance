// Ghost's bass-hit shader boost must never step (catalogue tour 2026-10-11,
// every pass at Ghost +163 s): the boost effect re-ran on every `impulse`
// change, so each progress-rate re-render reset the shaders to full and
// restarted the 450 ms recovery — a sawtooth for the whole 1.7 s impulse —
// and the "restore" branch then snapped them to base in one frame.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/audio/journey-compositor.tsx", "utf8");

describe("bass-hit shader boost is continuous", () => {
  it("is not an effect keyed on the per-frame impulse/approach values", () => {
    expect(src).not.toMatch(/\}, \[approach, impulse, evtType, enableBassFlash\]\);/);
    expect(src).toMatch(/\}, \[flashBoostActive\]\);/);
  });
  it("times the hit curve from the hit itself, not from a re-render", () => {
    expect(src).toMatch(/const sinceHit = now - bassHitStartRef\.current;/);
  });
  it("a hit at progress-rate updates never jumps more than a hair per frame after the spike", () => {
    // Same math as the compositor's tick, driven at 120 Hz with the engine
    // impulse updated only every 250 ms (the real cadence that sawtoothed).
    const base = 0.55, RECOVER_MS = 450, dtMs = 1000 / 120;
    let cur = base, prev = base, maxStep = 0;
    const hitAt = 1000;
    for (let now = 0; now < 4000; now += dtMs) {
      const tick250 = Math.floor(now / 250) * 250; // impulse as React last saw it
      const approach = tick250 < hitAt ? Math.max(0, 1 - (hitAt - tick250) / 1500) : 0;
      const el = (tick250 - hitAt) / 1000;
      const impulse = tick250 < hitAt ? 0 : el <= 0.5 ? 1 : Math.max(0, 1 - (el - 0.5) / 1.2);
      const hit = impulse > 0;
      const sinceHit = now - hitAt;
      if (hit && sinceHit < RECOVER_MS && sinceHit >= 0) {
        cur = 1 + (base - 1) * (1 - Math.pow(1 - sinceHit / RECOVER_MS, 3));
      } else {
        const goal = approach > 0 && !hit ? Math.min(1, base + approach * approach * 0.6) : base;
        cur += (goal - cur) * (1 - Math.exp(-(dtMs / 1000) / 0.12));
      }
      // the spike's attack frame is the intended percussive flash
      if (!(now >= hitAt && now - hitAt < dtMs)) maxStep = Math.max(maxStep, Math.abs(cur - prev));
      prev = cur;
    }
    expect(maxStep).toBeLessThan(0.03);
    expect(Math.abs(cur - base)).toBeLessThan(0.002); // handed back at base
  });
});
