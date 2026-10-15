import { describe, it, expect } from "vitest";
import { formatRunTime, setRunTime } from "./set-duration";

describe("set running time (phone remote)", () => {
  it("formats m:ss under an hour, h:mm:ss from an hour", () => {
    expect(formatRunTime(0)).toBe("0:00");
    expect(formatRunTime(2525)).toBe("42:05");
    expect(formatRunTime(6125)).toBe("1:42:05");
    expect(formatRunTime(3600)).toBe("1:00:00");
  });
  it("sums the set; a missing duration makes it approximate", () => {
    expect(setRunTime([{ dur: 125 }, { dur: 2400 }])).toBe("42:05");
    expect(setRunTime([{ dur: 6000 }, { dur: null }, { dur: 125 }])).toBe("~1:42:05");
    expect(setRunTime([{ dur: null }])).toBeNull();
    expect(setRunTime([])).toBeNull();
    expect(setRunTime(undefined)).toBeNull();
  });
});
