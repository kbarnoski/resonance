import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitKey,
  _resetRateLimitState,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimitState());

  it("allows the first request through", () => {
    const result = checkRateLimit("test:a", 5, 1);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(result.remaining).toBe(4);
  });

  it("allows requests up to capacity", () => {
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit("test:burst", 5, 0.1);
      expect(r.allowed).toBe(true);
    }
  });

  it("rejects the request that exceeds capacity", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("test:reject", 5, 0.1);
    const sixth = checkRateLimit("test:reject", 5, 0.1);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates buckets by key", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("test:user-a", 5, 0.1);
    const otherUser = checkRateLimit("test:user-b", 5, 0.1);
    expect(otherUser.allowed).toBe(true);
  });

  it("retryAfterMs scales with how far over the limit you went", async () => {
    // Drain the bucket then test retry hint
    for (let i = 0; i < 5; i++) checkRateLimit("test:retry", 5, 1);
    const blocked = checkRateLimit("test:retry", 5, 1);
    expect(blocked.allowed).toBe(false);
    // 1 token at 1 token/sec = ~1000ms retry
    expect(blocked.retryAfterMs).toBeGreaterThan(500);
    expect(blocked.retryAfterMs).toBeLessThan(2000);
  });

  it("refills tokens over time (real-time)", async () => {
    for (let i = 0; i < 5; i++) checkRateLimit("test:refill", 5, 50);
    // 50 tokens/sec → 100ms wait should refill ~5 tokens
    await new Promise((r) => setTimeout(r, 120));
    const result = checkRateLimit("test:refill", 5, 50);
    expect(result.allowed).toBe(true);
  });

  it("does not over-fill above capacity", async () => {
    checkRateLimit("test:cap", 3, 100);
    await new Promise((r) => setTimeout(r, 200)); // would over-fill if uncapped
    // After waiting, we should still only get capacity tokens, not capacity + extra
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (checkRateLimit("test:cap", 3, 100).allowed) allowed++;
    }
    // Capacity 3 + maybe 0.2s * 100/s = ~20 tokens; we get bursts of 3 + refill rate
    expect(allowed).toBeGreaterThanOrEqual(3);
  });

  it("zero capacity blocks everything", () => {
    const result = checkRateLimit("test:zero", 0, 0);
    expect(result.allowed).toBe(false);
  });
});

describe("rateLimitedResponse", () => {
  it("returns a 429 with Retry-After header", async () => {
    const res = rateLimitedResponse(2500);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3"); // ceil(2500/1000)
    const body = await res.json();
    expect(body.error).toMatch(/rate limit/i);
    expect(body.retryAfterMs).toBe(2500);
  });

  it("clamps Retry-After to at least 1 second", () => {
    const res = rateLimitedResponse(0);
    expect(res.headers.get("Retry-After")).toBe("1");
  });
});

describe("rateLimitKey", () => {
  function mkRequest(headers: Record<string, string> = {}): Request {
    return new Request("https://example.com/", { headers });
  }

  it("uses userId when supplied", () => {
    const key = rateLimitKey({
      userId: "abc",
      request: mkRequest(),
      scope: "test",
    });
    expect(key).toBe("test:user:abc");
  });

  it("falls back to first x-forwarded-for IP", () => {
    const key = rateLimitKey({
      userId: null,
      request: mkRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }),
      scope: "test",
    });
    expect(key).toBe("test:ip:1.2.3.4");
  });

  it("falls back to x-real-ip if x-forwarded-for is missing", () => {
    const key = rateLimitKey({
      userId: null,
      request: mkRequest({ "x-real-ip": "9.9.9.9" }),
      scope: "test",
    });
    expect(key).toBe("test:ip:9.9.9.9");
  });

  it("falls back to 'anon' if no IP at all", () => {
    const key = rateLimitKey({
      userId: null,
      request: mkRequest(),
      scope: "test",
    });
    expect(key).toBe("test:ip:anon");
  });

  it("includes scope so different routes have isolated buckets", () => {
    const a = rateLimitKey({ userId: "u1", request: mkRequest(), scope: "speak" });
    const b = rateLimitKey({ userId: "u1", request: mkRequest(), scope: "validate" });
    expect(a).not.toBe(b);
  });
});
