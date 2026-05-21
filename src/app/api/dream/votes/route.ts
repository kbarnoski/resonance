/**
 * GET /api/dream/votes
 *
 * Public endpoint. Returns the current vote state for every dream-lab
 * prototype slug. Used by the dashboard + each prototype page to
 * render heart/downvote indicators consistently for all visitors.
 *
 * Shape: { "1-live": 1, "23-pitch-harmonize": -1, ... } — values are
 * 1 (loved), -1 (downvoted). Rows with vote=0 are also returned but
 * the dashboard treats 0 as "not voted yet" visually.
 *
 * Writes happen via POST /api/dream/vote (admin-gated).
 */
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dream_votes")
    .select("slug, vote");

  if (error) {
    // If the table doesn't exist yet (migration not applied), return an
    // empty map rather than 500 — the UI degrades gracefully. Supabase's
    // PostgREST may return code 42P01 (raw Postgres), PGRST205 (schema
    // cache miss), or just a message containing "Could not find the
    // table". Match all three.
    const missing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /could not find the table/i.test(error.message ?? "");
    if (missing) {
      return Response.json({}, { status: 200 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.slug] = row.vote;

  return Response.json(map, {
    headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" },
  });
}
