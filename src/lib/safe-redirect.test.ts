import { describe, it, expect } from "vitest";
import { safeInternalRedirect } from "./safe-redirect";

describe("safeInternalRedirect", () => {
  it("returns fallback for null/undefined/empty", () => {
    expect(safeInternalRedirect(null, "/room")).toBe("/room");
    expect(safeInternalRedirect(undefined, "/room")).toBe("/room");
    expect(safeInternalRedirect("", "/room")).toBe("/room");
  });

  it("accepts simple relative paths", () => {
    expect(safeInternalRedirect("/library", "/room")).toBe("/library");
    expect(safeInternalRedirect("/recordings/abc", "/room")).toBe("/recordings/abc");
    expect(safeInternalRedirect("/path/d2c79111?view=app", "/room")).toBe(
      "/path/d2c79111?view=app",
    );
  });

  it("rejects protocol-relative URLs (//evil.com/x)", () => {
    expect(safeInternalRedirect("//evil.com/x", "/room")).toBe("/room");
    expect(safeInternalRedirect("//evil.com", "/room")).toBe("/room");
  });

  it("rejects backslash variant of protocol-relative (/\\evil.com)", () => {
    expect(safeInternalRedirect("/\\evil.com", "/room")).toBe("/room");
  });

  it("rejects absolute URLs with scheme", () => {
    expect(safeInternalRedirect("https://evil.com/x", "/room")).toBe("/room");
    expect(safeInternalRedirect("http://evil.com/x", "/room")).toBe("/room");
    expect(safeInternalRedirect("javascript:alert(1)", "/room")).toBe("/room");
    expect(safeInternalRedirect("data:text/html,<script>alert(1)</script>", "/room")).toBe("/room");
  });

  it("rejects values that don't start with /", () => {
    expect(safeInternalRedirect("library", "/room")).toBe("/room");
    expect(safeInternalRedirect("evil.com", "/room")).toBe("/room");
  });

  it("rejects strings with embedded scheme separator", () => {
    // Defense in depth — a weird leading-slash edge case shouldn't
    // sneak past simply because the URL constructor is lenient.
    expect(safeInternalRedirect("/foo://bar", "/room")).toBe("/room");
  });

  it("preserves query strings and fragments", () => {
    expect(safeInternalRedirect("/library?tab=recent", "/room")).toBe("/library?tab=recent");
    expect(safeInternalRedirect("/library#bottom", "/room")).toBe("/library#bottom");
  });
});
