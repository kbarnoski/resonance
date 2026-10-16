import { describe, expect, it } from "vitest";
import { parseTitlesCommand } from "./track-titles";

describe("titles between tracks", () => {
  it("parses the phone commands", () => {
    expect(parseTitlesCommand("titles:off")).toBe(true);
    expect(parseTitlesCommand("titles:on")).toBe(false);
    expect(parseTitlesCommand("title-hold")).toBeNull();
    expect(parseTitlesCommand("titles:")).toBeNull();
  });
});
