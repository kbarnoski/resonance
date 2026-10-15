import { describe, it, expect } from "vitest";
import { scriptedStillAt, scriptedStillNext, TAKE_STILL_SCRIPTS } from "./pinned-takes";

const RISE1 = "1f83e254-a0c8-45ec-974f-8b363038a98d";

describe("pinned still scripts — the morph cover takes the script's next still", () => {
  it("Rise 1: at 15 s (travel-0 ends) the current still is gen-000 and the next is gen-002 — never an unscripted gen-001", () => {
    expect(TAKE_STILL_SCRIPTS[RISE1]).toBeTruthy();
    expect(scriptedStillAt(RISE1, 15)).toBe("gen-000.jpg");
    expect(scriptedStillNext(RISE1, 15)).toBe("gen-002.jpg");
  });
  it("next is null past the end and for unscripted journeys", () => {
    const last = TAKE_STILL_SCRIPTS[RISE1].at(-1)![0];
    expect(scriptedStillNext(RISE1, last + 1)).toBeNull();
    expect(scriptedStillNext("no-such-journey", 10)).toBeNull();
    expect(scriptedStillNext(null, 10)).toBeNull();
  });
  it("every script's next entry is strictly later than the current one", () => {
    for (const [id, s] of Object.entries(TAKE_STILL_SCRIPTS)) {
      for (let i = 0; i + 1 < s.length; i++) expect(scriptedStillNext(id, s[i][0])).toBe(s.find(([at]) => at > s[i][0] + 0.5)?.[1] ?? null);
    }
  });
});
