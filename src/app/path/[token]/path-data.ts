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

export interface PathRow {
  id: string;
  user_id: string | null;
  name: string;
  subtitle: string | null;
  description: string | null;
  journey_ids: string[];
  culmination_journey_id: string | null;
  accent_color: string | null;
  glow_color: string | null;
  share_token: string;
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

    const { data: path, error } = await supabase
      .from("journey_paths")
      .select("*")
      .eq("share_token", token)
      .single();
    if (error || !path) return null;

    // Journeys in the path + the culmination, fetched as one query.
    const allIds = [...((path.journey_ids as string[]) ?? [])];
    if (path.culmination_journey_id) allIds.push(path.culmination_journey_id as string);

    const { data: journeys } = await supabase
      .from("journeys")
      .select(
        "id, name, subtitle, description, share_token, theme, recording_id, creator_name, photography_credit"
      )
      .in("id", allIds);

    return {
      path: path as PathRow,
      journeys: (journeys ?? []) as JourneyRow[],
    };
  },
  ["public-path-payload"],
  { revalidate: 300 }
);
