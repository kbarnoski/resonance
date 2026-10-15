import { describe, it, expect } from "vitest";
import { liveSourceOf } from "./live-source";

describe("kiosk live source report (phone 'Listen to')", () => {
  it("defaults to the mic", () => expect(liveSourceOf("?live=1&kiosk=1", false)).toBe("mic"));
  it("reads ?livesrc=", () => {
    expect(liveSourceOf("?live=1&livesrc=laptop", false)).toBe("laptop");
    expect(liveSourceOf("?live=1&livesrc=both", false)).toBe("both");
    expect(liveSourceOf("?live=1&livesrc=bogus", false)).toBe("mic");
  });
  it("a live set hears the set", () => {
    expect(liveSourceOf("?live=1&liveset=joseph&at=3", false)).toBe("set");
    expect(liveSourceOf("?live=1&livesrc=laptop", true)).toBe("set");
  });
});
