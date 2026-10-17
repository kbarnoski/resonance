import { describe, it, expect } from "vitest";
import { parseMicSensitivityCommand, micSpanX } from "./mic-sensitivity";
import { conductTarget, newPulse, LIVE_CONDUCT_SPAN } from "./live-pulse";

describe("mic sensitivity", () => {
  it("parses the phone's three settings, nothing else", () => {
    expect(parseMicSensitivityCommand("micsens:less")).toBe("less");
    expect(parseMicSensitivityCommand("micsens:normal")).toBe("normal");
    expect(parseMicSensitivityCommand("micsens:more")).toBe("more");
    for (const c of ["micsens:", "micsens:max", "micsens", "titles:on"]) expect(parseMicSensitivityCommand(c)).toBeNull();
  });
  it("More reaches full intensity on softer sound; Less needs more", () => {
    const s = { ...newPulse(0.05), short: 0.05 * 1.35 + 0.01 + 0.06 };
    const at = (v: "less" | "normal" | "more") => conductTarget(s, LIVE_CONDUCT_SPAN * micSpanX(v));
    expect(at("more")).toBeGreaterThan(at("normal"));
    expect(at("normal")).toBeGreaterThan(at("less"));
    expect(at("more")).toBe(1);
    expect(conductTarget(newPulse(0.05), LIVE_CONDUCT_SPAN * micSpanX("more"))).toBe(0); // the quiet room stays still
  });
});
