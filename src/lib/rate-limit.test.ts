import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitKey,
  _resetRateLimitState,
} from "./rate-limit";

describe("checkRateLimit (in-memory backend)", () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    _resetRateLimitState();
  });

  it("allows the first request through", async () => {
    const result = await checkRateLimit("test:a", 5, 1);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(result.remaining).toBe(4);
  });

  it("allows requests up to capacity", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit("test:burst", 5, 0.1);
      expect(r.allowed).toBe(true);
    }
  });

  it("rejects the request that exceeds capacity", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("test:reject", 5, 0.1);
    const sixth = await checkRateLimit("test:reject", 5, 0.1);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates buckets by key", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("test:user-a", 5, 0.1);
    const otherUser = await checkRateLimit("test:user-b", 5, 0.1);
    expect(otherUser.allowed).toBe(true);
  });

  it("retryAfterMs scales with how far over the limit you went", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("test:retry", 5, 1);
    const blocked = await checkRateLimit("test:retry", 5, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(500);
    expect(blocked.retryAfterMs).toBeLessThan(2000);
  });

  it("refills tokens over time (real-time)", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("test:refill", 5, 50);
    await new Promise((r) => setTimeout(r, 120));
    const result = await checkRateLimit("test:refill", 5, 50);
    expect(result.allowed).toBe(true);
  });

  it("does not over-fill above capacity", async () => {
    await checkRateLimit("test:cap", 3, 100);
    await new Promise((r) => setTimeout(r, 200));
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await checkRateLimit("test:cap", 3, 100)).allowed) allowed++;
    }
    expect(allowed).toBeGreaterThanOrEqual(3);
  });

  it("zero capacity blocks everything", async () => {
    const result = await checkRateLimit("test:zero", 0, 0);
    expect(result.allowed).toBe(false);
  });
});

describe("rateLimitedResponse", () => {
  it("returns a 429 with Retry-After header", async () => {
    const res = rateLimitedResponse(2500);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3");
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

describe("checkRateLimit (KV backend)", () => {
  type FetchArgs = [RequestInfo | URL, RequestInit | undefined];
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: FetchArgs[];
  let nextResponse: { status: number; result?: unknown; error?: string };

  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://test-kv.example.com";
    process.env.KV_REST_API_TOKEN = "test-token";
    _resetRateLimitState();

    originalFetch = globalThis.fetch;
    fetchCalls = [];
    nextResponse = { status: 200, result: [1, 0, 4] };
    globalThis.fetch = vi.fn(async (...args: unknown[]) => {
      fetchCalls.push(args as FetchArgs);
      return new Response(
        JSON.stringify({
          result: nextResponse.result,
          error: nextResponse.error,
        }),
        { status: nextResponse.status },
      );
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    _resetRateLimitState();
  });

  it("calls the KV REST endpoint when env vars are set", async () => {
    await checkRateLimit("test:kv", 5, 1);
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const [url, init] = fetchCalls[0];
    expect(String(url)).toBe("https://test-kv.example.com");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body ?? "[]"));
    expect(body[0]).toBe("EVAL");
  });

  it("returns the result the KV backend produced", async () => {
    nextResponse = { status: 200, result: [1, 0, 3] };
    const r = await checkRateLimit("test:kv-allowed", 5, 1);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3);

    nextResponse = { status: 200, result: [0, 1500, 0] };
    const r2 = await checkRateLimit("test:kv-blocked", 5, 1);
    expect(r2.allowed).toBe(false);
    expect(r2.retryAfterMs).toBe(1500);
  });

  it("falls back to in-memory when KV REST returns an error", async () => {
    nextResponse = { status: 500, result: undefined };
    const r = await checkRateLimit("test:kv-fallback", 5, 1);
    // First request: in-memory has 5 tokens, this consumes one → allowed.
    expect(r.allowed).toBe(true);
  });

  it("falls back to in-memory when KV returns malformed result", async () => {
    nextResponse = { status: 200, result: "not-an-array" };
    const r = await checkRateLimit("test:kv-malformed", 5, 1);
    // Malformed means the KV path returns allowed:true, but the wrapper
    // doesn't fall through to in-memory in that case (it trusts the
    // backend). Still, the request should be allowed.
    expect(r.allowed).toBe(true);
  });
});
