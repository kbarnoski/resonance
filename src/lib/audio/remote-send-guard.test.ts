import { describe, it, expect } from "vitest";
import { createRepeatGuard, REPEAT_GUARD_MS } from "./remote-send-guard";

describe("phone remote repeat guard", () => {
  it("drops an identical command inside the window", () => {
    const ok = createRepeatGuard();
    expect(ok("next", 0)).toBe(true);
    expect(ok("next", 120)).toBe(false);
  });
  it("lets the same command through after the window", () => {
    const ok = createRepeatGuard();
    expect(ok("skip", 0)).toBe(true);
    expect(ok("skip", REPEAT_GUARD_MS + 1)).toBe(true);
  });
  it("never blocks a different command", () => {
    const ok = createRepeatGuard();
    expect(ok("next", 0)).toBe(true);
    expect(ok("fadeout", 10)).toBe(true);
    expect(ok("next", 20)).toBe(true);
  });
  it("a dropped repeat does not extend the window", () => {
    const ok = createRepeatGuard(800);
    expect(ok("skip", 0)).toBe(true);
    expect(ok("skip", 700)).toBe(false);
    expect(ok("skip", 801)).toBe(true);
  });
});
