import { afterEach, describe, expect, it } from "vitest";
import { liveSetResponse, setLiveSetDrive } from "./live-drive";
import { journeyResponse } from "./kinetic";
import { rateSmoothK, RATE_SMOOTH_K } from "./shader-drive";

afterEach(() => setLiveSetDrive(false));

describe("live set drive (Joseph)", () => {
  it("lifts every world one notch, floor groove, capped", () => {
    expect(liveSetResponse(1.3)).toBeCloseTo(2.5);   // solo piano → big
    expect(liveSetResponse(2.0)).toBeCloseTo(2.5);   // groove → big
    expect(liveSetResponse(2.5)).toBeCloseTo(3.0);   // big → capped
  });
  it("only while a live set runs; mastered stay mastered", () => {
    const solo = { id: "x", name: "Welcome Home" };
    expect(journeyResponse(solo)).toBeCloseTo(1.3);
    setLiveSetDrive(true);
    expect(journeyResponse(solo)).toBeCloseTo(2.5);
    expect(journeyResponse({ id: "ghost", name: "Ghost" })).toBe(1);
    expect(rateSmoothK(1)).toBeCloseTo(RATE_SMOOTH_K * 1.5);
    setLiveSetDrive(false);
    expect(rateSmoothK(1)).toBe(RATE_SMOOTH_K);
  });
});
