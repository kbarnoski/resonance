import { describe, it, expect, vi } from "vitest";
import { signatureFlightMayFly, endSignatureFlight, type FlightGuardState } from "./signature-flight-guard";

// Show day 2026-10-15 (Karel: "i dont want the piano flying"): a title-hold
// during Yellow Bird's opening flight flew the title card's PIANO off along
// the bird's path. A flight only ever carries the journey's own emblem.
const bird: FlightGuardState = { imgLoaded: "emblem", imgKey: "emblem:0", flightOcc: 0, imgReleasing: false, cardHeld: false, disposed: false };

describe("signature flight — only the journey's own bird ever flies", () => {
  it("flies the journey's own emblem for the flown occurrence", () => {
    expect(signatureFlightMayFly(bird)).toBe(true);
    expect(signatureFlightMayFly({ ...bird, imgKey: "emblem:2", flightOcc: 2 })).toBe(true);
  });
  it("NEVER while the title card (piano) owns the engine", () => {
    expect(signatureFlightMayFly({ ...bird, cardHeld: true })).toBe(false);
  });
  it("never after the journey layer let go of the engine (teardown / jump / hold)", () => {
    expect(signatureFlightMayFly({ ...bird, disposed: true })).toBe(false);
  });
  it("never any other image: angel, motif, moment, echo, none, or another emblem occurrence", () => {
    for (const imgLoaded of ["angel", "motif", "moment", "echo", null]) {
      expect(signatureFlightMayFly({ ...bird, imgLoaded })).toBe(false);
    }
    expect(signatureFlightMayFly({ ...bird, imgKey: "emblem:1" })).toBe(false);
    expect(signatureFlightMayFly({ ...bird, imgKey: null })).toBe(false);
    expect(signatureFlightMayFly({ ...bird, flightOcc: -1, imgKey: "emblem:-1" })).toBe(false);
  });
  it("never while the worn image is letting go", () => {
    expect(signatureFlightMayFly({ ...bird, imgReleasing: true })).toBe(false);
  });
  it("ending a flight clears the engine pose (the next owner inherits nothing) and never throws", () => {
    const engine = { setImageFlight: vi.fn() };
    endSignatureFlight(engine);
    expect(engine.setImageFlight).toHaveBeenCalledWith(null);
    expect(() => endSignatureFlight(null)).not.toThrow();
    expect(() => endSignatureFlight({ setImageFlight: () => { throw new Error("lost"); } })).not.toThrow();
  });
});
