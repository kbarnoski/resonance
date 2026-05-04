import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the supabase server client. Each test's vi.mock factory
// returns a getUser() result we control via setMockUser below.
const mockState: { user: { id: string; email: string | null } | null } = { user: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockState.user }, error: null }),
    },
  }),
}));

// Import AFTER vi.mock has been registered.
const { requireAdmin, isAdmin } = await import("./require-admin");

function setMockUser(user: { id: string; email: string | null } | null) {
  mockState.user = user;
}

describe("requireAdmin", () => {
  beforeEach(() => {
    setMockUser(null);
    delete process.env.ADMIN_EMAIL;
  });

  it("returns 401 when no user is authenticated", async () => {
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.error).toBe("Unauthorized");
    }
  });

  it("returns 503 when ADMIN_EMAIL is unset (fail-closed)", async () => {
    setMockUser({ id: "u1", email: "anyone@example.com" });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      const body = await result.response.json();
      expect(body.error).toMatch(/admin not configured/i);
    }
  });

  it("returns 403 when user is authenticated but not admin", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    setMockUser({ id: "u1", email: "stranger@example.com" });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows the admin user through", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    setMockUser({ id: "u-admin", email: "boss@example.com" });
    const result = await requireAdmin();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.user.id).toBe("u-admin");
      expect(result.result.user.email).toBe("boss@example.com");
    }
  });

  it("normalizes case on both sides", async () => {
    process.env.ADMIN_EMAIL = "BOSS@example.com";
    setMockUser({ id: "u-admin", email: "boss@EXAMPLE.com" });
    const result = await requireAdmin();
    expect(result.ok).toBe(true);
  });

  it("strips surrounding whitespace from ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "  boss@example.com  ";
    setMockUser({ id: "u-admin", email: "boss@example.com" });
    const result = await requireAdmin();
    expect(result.ok).toBe(true);
  });

  it("rejects when user has no email at all", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    setMockUser({ id: "u1", email: null });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});

describe("isAdmin", () => {
  beforeEach(() => {
    setMockUser(null);
    delete process.env.ADMIN_EMAIL;
  });

  it("returns true when admin", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    setMockUser({ id: "u-admin", email: "boss@example.com" });
    expect(await isAdmin()).toBe(true);
  });

  it("returns false when not admin", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    setMockUser({ id: "u1", email: "stranger@example.com" });
    expect(await isAdmin()).toBe(false);
  });

  it("returns false when not authenticated", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    expect(await isAdmin()).toBe(false);
  });
});
