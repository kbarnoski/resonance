import { describe, it } from "vitest";

/**
 * H1/M1 — recording_id IDOR: ACCEPTED RISK by explicit owner ruling.
 *
 * Finding (maturity audit 2026-08-14, re-confirmed 2026-08-25 full
 * audit, P1-Security #9): `/api/audio/[id]` and
 * `/api/recordings/[id]/analysis` will serve a recording to anonymous
 * callers when the recording is attached to ANY journey with a
 * share_token — the recording id alone is the capability. Recording
 * ids are UUIDs, so practical enumeration is hard, and every exposed
 * row belongs to content the owner deliberately shared; Karel ruled
 * this an accepted risk and directed that it NOT be silently
 * re-hardened.
 *
 * This skip-marked test exists so:
 *   1. the ruling is recorded next to the code (grep "IDOR" finds it),
 *   2. any future agent that "fixes" the behavior trips over this file
 *      and reads the ruling first,
 *   3. if the ruling is ever reversed, un-skip and implement the
 *      assertions below.
 *
 * DO NOT un-skip or re-harden without an explicit owner decision.
 */
describe("recording_id IDOR (H1) — accepted risk, owner ruling", () => {
  it.skip("anon GET /api/audio/[id] for a journey-shared recording returns 200 (accepted)", () => {
    // If the ruling flips, assert instead that an anonymous request for
    // a recording that is NOT featured and has NO recording-level
    // share_token returns 404 even when a shared journey references it,
    // and that playback flows switch to journey-token-scoped resolution
    // (see supabase/migrations/MIGRATION-NOTES-2026-08-25.md).
  });

  it.skip("anon GET /api/recordings/[id]/analysis for a journey-shared recording returns 200 (accepted)", () => {
    // Same ruling, same flip procedure as above.
  });
});
