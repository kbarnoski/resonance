import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recording attachment gate (security audit 2026-09-25, finding H-1).
 *
 * A journey's `recording_id` was persisted from the request body with no
 * ownership check, and the shared-audio resolver trusts any journey with a
 * share token — so an attacker could attach a victim's recording UUID to
 * their own journey, mint a share token, and read the victim's master
 * through /api/audio/[id].
 *
 * Rule: a caller may attach a recording iff it is VISIBLE TO THEM under
 * RLS — i.e. they own it, or it is publicly released (featured/shared
 * policies). One RLS-scoped SELECT answers both; no service-role needed.
 */
export async function canAttachRecording(
  supabase: SupabaseClient,
  recordingId: string | null | undefined,
): Promise<boolean> {
  if (!recordingId) return true; // detaching / none is always fine
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordingId)) {
    return false;
  }
  const { data, error } = await supabase
    .from("recordings")
    .select("id")
    .eq("id", recordingId)
    .maybeSingle();
  return !error && !!data;
}
