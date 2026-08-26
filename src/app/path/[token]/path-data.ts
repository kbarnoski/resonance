/**
 * Cached public path payload — shared by page.tsx, generateMetadata,
 * and opengraph-image.tsx so a share-link hit costs at most one pair
 * of Supabase queries per token per revalidation window.
 *
 * The payload is identical for every anonymous viewer (it's the public
 * album landing), so it's safe to cache aggressively. The things that
 * differ per viewer — auth/ownership for `?view=app`, localStorage
 * progress — are resolved outside this function.
 */
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

export interface JourneyRow {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  share_token: string | null;
  theme: { palette?: { accent?: string; glow?: string } } | null;
  recording_id: string | null;
  creator_name: string | null;
  photography_credit: string | null;
}

// Mirrors the columns returned by the `get_path_by_token` SECURITY DEFINER
// function (supabase/migrations/20260825120000_anon_token_scoped_access.sql).
// Deliberately excludes user_id and share_token — ownership for ?view=app is
// resolved in page.tsx via a cookie-client read under the owner RLS policy,
// and callers already hold the token.
export interface PathRow {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  journey_ids: string[];
  culmination_journey_id: string | null;
  accent_color: string | null;
  glow_color: string | null;
}

export interface PublicPathPayload {
  path: PathRow;
  journeys: JourneyRow[];
}

function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const getPublicPathPayload = unstable_cache(
  async (token: string): Promise<PublicPathPayload | null> => {
    const supabase = createAnonClient();

    // Token-scoped SECURITY DEFINER reads — survive the Phase-2 anon RLS
    // flip (see supabase/migrations/MIGRATION-NOTES-2026-08-25.md). Both
    // functions key off the path share token the visitor already holds.
    const { data: pathRows, error } = await supabase.rpc("get_path_by_token", {
      p_token: token,
    });
    const path = (pathRows as PathRow[] | null)?.[0];
    if (error || !path) return null;

    // Member journeys + culmination in one call, keyed by the same token.
    // The function returns a superset of columns (phases, story_text, …);
    // map down to what the path pages use so the cached payload stays lean.
    const { data: journeyRows } = await supabase.rpc("get_path_journeys", {
      p_token: token,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const journeys: JourneyRow[] = ((journeyRows ?? []) as any[]).map((j) => ({
      id: j.id,
      name: j.name,
      subtitle: j.subtitle ?? null,
      description: j.description ?? null,
      share_token: j.share_token ?? null,
      theme: j.theme ?? null,
      recording_id: j.recording_id ?? null,
      creator_name: j.creator_name ?? null,
      photography_credit: j.photography_credit ?? null,
    }));

    return { path, journeys };
  },
  // v2: payload shape changed with the rpc migration (no user_id /
  // share_token on the path row) — new key so stale entries never mix.
  ["public-path-payload-v2"],
  { revalidate: 300 }
);
