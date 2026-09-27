import { describe, it, expect } from "vitest";
import { canAttachRecording } from "./validate-recording-access";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stub supabase: RLS-visible rows are whatever `visible` contains.
function stubClient(visible: string[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () =>
            visible.includes(id)
              ? { data: { id }, error: null }
              : { data: null, error: null },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const OWNED = "11111111-2222-3333-4444-555555555555";
const FOREIGN = "99999999-8888-7777-6666-555555555555";

describe("canAttachRecording (security audit 2026-09-25 H-1)", () => {
  it("allows null/undefined (detaching)", async () => {
    expect(await canAttachRecording(stubClient([]), null)).toBe(true);
    expect(await canAttachRecording(stubClient([]), undefined)).toBe(true);
  });

  it("allows an RLS-visible recording (owned or released)", async () => {
    expect(await canAttachRecording(stubClient([OWNED]), OWNED)).toBe(true);
  });

  it("REJECTS a recording invisible under RLS — the IDOR chain", async () => {
    expect(await canAttachRecording(stubClient([OWNED]), FOREIGN)).toBe(false);
  });

  it("rejects malformed ids before touching the database", async () => {
    expect(await canAttachRecording(stubClient([OWNED]), "not-a-uuid")).toBe(false);
    expect(await canAttachRecording(stubClient([OWNED]), "1; DROP TABLE recordings")).toBe(false);
  });
});
