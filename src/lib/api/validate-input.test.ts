import { describe, it, expect } from "vitest";
import {
  requireString,
  optionalString,
  requireHttpUrl,
  requireNumber,
  requireEnum,
  optionalEnum,
  requireStringArray,
  readJsonBody,
} from "./validate-input";

describe("requireString", () => {
  it("accepts a valid string", () => {
    const r = requireString("hello", "field", { max: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("hello");
  });

  it("trims whitespace", () => {
    const r = requireString("  hi  ", "field", { max: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("hi");
  });

  it("rejects non-string", async () => {
    const r = requireString(123, "field", { max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error).toMatch(/missing field/i);
    }
  });

  it("rejects strings exceeding max length", async () => {
    const r = requireString("a".repeat(101), "field", { max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.error).toMatch(/too long/i);
    }
  });

  it("rejects strings below min length", async () => {
    const r = requireString("hi", "field", { min: 5, max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.error).toMatch(/too short/i);
    }
  });
});

describe("optionalString", () => {
  it("returns undefined for missing values", () => {
    expect(optionalString(undefined, "x", { max: 10 })).toEqual({ ok: true, value: undefined });
    expect(optionalString(null, "x", { max: 10 })).toEqual({ ok: true, value: undefined });
    expect(optionalString("", "x", { max: 10 })).toEqual({ ok: true, value: undefined });
  });

  it("validates when present", () => {
    const r = optionalString("ok", "x", { max: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("ok");
  });
});

describe("requireHttpUrl", () => {
  it("accepts https URLs", () => {
    const r = requireHttpUrl("https://example.com/foo", "url");
    expect(r.ok).toBe(true);
  });

  it("accepts http URLs", () => {
    const r = requireHttpUrl("http://example.com/", "url");
    expect(r.ok).toBe(true);
  });

  it("rejects non-http(s) URLs", async () => {
    const r = requireHttpUrl("file:///etc/passwd", "url");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.error).toMatch(/http\(s\)/);
    }
  });

  it("rejects malformed URLs", async () => {
    const r = requireHttpUrl("not a url", "url");
    expect(r.ok).toBe(false);
  });

  it("enforces host allowlist", async () => {
    const r = requireHttpUrl("https://evil.example.com/x", "url", {
      allowedHosts: ["fal.media", "fal.run"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.error).toMatch(/host not allowed/i);
    }
  });

  it("allows subdomains of allowlisted hosts", () => {
    const r = requireHttpUrl("https://v3.fal.media/file.png", "url", {
      allowedHosts: ["fal.media"],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects URLs above maxLength", async () => {
    const r = requireHttpUrl("https://example.com/" + "a".repeat(3000), "url", { maxLength: 100 });
    expect(r.ok).toBe(false);
  });
});

describe("requireNumber", () => {
  it("accepts numbers in range", () => {
    const r = requireNumber(0.5, "speed", { min: 0, max: 1 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-numbers", async () => {
    const r = requireNumber("0.5", "speed", { min: 0, max: 1 });
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range numbers", async () => {
    const r = requireNumber(2, "speed", { min: 0, max: 1 });
    expect(r.ok).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(requireNumber(NaN, "x", { min: 0, max: 1 }).ok).toBe(false);
    expect(requireNumber(Infinity, "x", { min: 0, max: 1 }).ok).toBe(false);
  });
});

describe("requireEnum", () => {
  const allowed = ["alpha", "beta", "gamma"] as const;

  it("accepts allowed values", () => {
    const r = requireEnum("beta", "phase", allowed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("beta");
  });

  it("rejects values not in allowed", async () => {
    const r = requireEnum("delta", "phase", allowed);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.error).toMatch(/alpha, beta, gamma/);
    }
  });
});

describe("optionalEnum", () => {
  const allowed = ["a", "b"] as const;

  it("returns undefined for missing", () => {
    expect(optionalEnum(undefined, "x", allowed)).toEqual({ ok: true, value: undefined });
  });

  it("validates when present", () => {
    const r = optionalEnum("a", "x", allowed);
    expect(r.ok).toBe(true);
  });
});

describe("requireStringArray", () => {
  it("accepts valid arrays", () => {
    const r = requireStringArray(["one", "two"], "items", { maxItems: 5, maxItemLength: 10 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-arrays", async () => {
    const r = requireStringArray("nope", "items", { maxItems: 5, maxItemLength: 10 });
    expect(r.ok).toBe(false);
  });

  it("rejects arrays exceeding maxItems", async () => {
    const r = requireStringArray(["a", "b", "c", "d"], "items", { maxItems: 2, maxItemLength: 10 });
    expect(r.ok).toBe(false);
  });

  it("rejects items above maxItemLength", async () => {
    const r = requireStringArray(["short", "x".repeat(20)], "items", { maxItems: 5, maxItemLength: 10 });
    expect(r.ok).toBe(false);
  });

  it("rejects non-string items", async () => {
    const r = requireStringArray(["ok", 42], "items", { maxItems: 5, maxItemLength: 10 });
    expect(r.ok).toBe(false);
  });
});

describe("readJsonBody", () => {
  function mkRequest(body: string, contentType = "application/json"): Request {
    return new Request("https://example.com/", {
      method: "POST",
      body,
      headers: { "Content-Type": contentType },
    });
  }

  it("parses valid JSON", async () => {
    const r = await readJsonBody(mkRequest('{"x": 1}'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ x: 1 });
  });

  it("returns 400 on invalid JSON", async () => {
    const r = await readJsonBody(mkRequest("not json"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error).toMatch(/invalid json/i);
    }
  });
});
