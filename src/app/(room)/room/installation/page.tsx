import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InstallationClient } from "@/components/audio/installation-client";
import { InstallationLoopClient, type SequenceEntry } from "@/components/audio/installation-loop-client";
import { getJourney } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { INSTALLATION_SEQUENCE } from "@/lib/journeys/installation-sequence";
import type { Track } from "@/lib/audio/audio-store";
import type { Journey } from "@/lib/journeys/types";

// Belt + suspenders: middleware should auth-gate this route, but if Vercel
// edge cache or any prerender path bypasses middleware, this in-page check
// catches it. Also ensures every request actually executes server code.
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ journey?: string; loop?: string; debug?: string }>;
}

export default async function InstallationPage({ searchParams }: Props) {
  const { journey, loop, debug } = await searchParams;
  const isLoop = loop === "1" || loop === "true";
  const isDebug = debug === "1" || debug === "true";

  // Require auth at the page level. The realtime AI image service calls
  // /api/ai-image/token which is gated to authed users; without a session
  // the kiosk would run shader-only with no imagery. Redirect cold visitors
  // through login first so they have a token by the time the loop starts.
  const supabaseAuth = await createClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
  if (!authUser) {
    const target = isLoop ? "/room/installation?loop=1" : "/room/installation";
    redirect(`/login?redirectTo=${encodeURIComponent(target)}`);
  }

  // ─── Loop mode: curated sequence of all built-in journeys ─────────
  // Sequence draft = every featured (built-in) journey in declaration
  // order. Karel will prune/reorder later. Each journey gets paired with
  // its hardcoded `recordingId`, then a PAIRED_TRACKS title-pattern
  // lookup, then a random featured recording, in that order.
  if (isLoop) {
    const supabase = await createClient();

    // Pull featured recordings as the primary pool, then fall back to
    // the user's full library if featured is empty. Mirrors the normal
    // journey-selector behavior: any unpaired journey gets a random
    // track from the user's recordings rather than silently failing
    // because no featured tracks are configured for this account.
    let featuredRecordings: { id: string; title: string; artist: string | null; duration: number | null }[] = [];
    try {
      const { data } = await supabase
        .from("recordings")
        .select("id, title, artist, duration")
        .eq("is_featured", true)
        .order("created_at", { ascending: true });
      if (data) featuredRecordings = data as typeof featuredRecordings;
    } catch {
      // is_featured column may not exist in all envs; pool stays empty.
    }

    // If no featured tracks (or DB doesn't have the column), use the
    // user's whole library so every unpaired journey still has audio.
    if (featuredRecordings.length === 0) {
      const { data: userRecs } = await supabase
        .from("recordings")
        .select("id, title, artist, duration")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (userRecs) featuredRecordings = userRecs as typeof featuredRecordings;
    }

    // Resolve PAIRED_TRACKS patterns → recording rows so we can hand the
    // exact track to a journey by id rather than mid-flight pattern match.
    const pairedPatterns = Object.entries(PAIRED_TRACKS); // [journeyId, ilike]
    const pairedRecordingByJourneyId: Record<string, typeof featuredRecordings[number]> = {};
    if (pairedPatterns.length > 0) {
      const orFilter = pairedPatterns.map(([, p]) => `title.ilike.${p}`).join(",");
      const { data: pairedRows } = await supabase
        .from("recordings")
        .select("id, title, artist, duration")
        .or(orFilter);
      if (pairedRows) {
        for (const [jid, ilike] of pairedPatterns) {
          // Strip % wildcards for substring match.
          const needle = ilike.replace(/^%|%$/g, "").toLowerCase();
          const hit = (pairedRows as typeof featuredRecordings).find((r) =>
            (r.title ?? "").toLowerCase().includes(needle),
          );
          if (hit) pairedRecordingByJourneyId[jid] = hit;
        }
      }
    }

    const toTrack = (r: { id: string; title: string; artist: string | null; duration: number | null }): Track => ({
      id: r.id,
      title: r.title || "Untitled",
      audioUrl: `/api/audio/${r.id}`,
      duration: r.duration,
      artist: r.artist,
    });

    // Walk INSTALLATION_SEQUENCE (explicit ordering with neural-link
    // skipped + ghost/snowflake last) instead of JOURNEYS so the
    // installation experience stays curated independent of the
    // declaration order in journeys.ts.
    const sequence: SequenceEntry[] = INSTALLATION_SEQUENCE
      .map((id) => getJourney(id))
      .filter((j): j is Journey => !!j)
      .map((j: Journey) => {
        // Priority 1: explicit recordingId baked into the journey definition.
        if (j.recordingId) {
          const direct = featuredRecordings.find((r) => r.id === j.recordingId);
          if (direct) return { journey: j, track: toTrack(direct) };
        }
        // Priority 2: title-pattern pairing (e.g., "ghost" → KB_GHOST_REF).
        const paired = pairedRecordingByJourneyId[j.id];
        if (paired) return { journey: j, track: toTrack(paired) };
        // Priority 3: leave null; loop client will pick from fallback pool.
        return { journey: j, track: null };
      });

    const fallbackTracks = featuredRecordings.map(toTrack);

    return (
      <div className="h-screen w-screen overflow-hidden bg-black">
        <InstallationLoopClient sequence={sequence} fallbackTracks={fallbackTracks} debug={isDebug} />
      </div>
    );
  }

  // ─── Legacy single-journey kiosk mode (unchanged) ──────────────────
  let tracks: Track[] = [];
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: featured } = await supabase
      .from("recordings")
      .select("id, title, duration")
      .eq("is_featured", true)
      .order("created_at", { ascending: true });

    if (featured && featured.length > 0) {
      tracks = featured.map((r) => ({
        id: r.id,
        title: r.title || "Untitled",
        audioUrl: `/api/audio/${r.id}`,
        duration: r.duration,
      }));
    } else if (user) {
      const { data: all } = await supabase
        .from("recordings")
        .select("id, title, duration")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (all) {
        tracks = all.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          audioUrl: `/api/audio/${r.id}`,
          duration: r.duration,
        }));
      }
    }
  } catch {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return (
          <div className="h-screen w-screen overflow-hidden bg-black">
            <InstallationClient tracks={[]} journey={journey} />
          </div>
        );
      }
      const { data: all } = await supabase
        .from("recordings")
        .select("id, title, duration")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (all) {
        tracks = all.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          audioUrl: `/api/audio/${r.id}`,
          duration: r.duration,
        }));
      }
    } catch {
      // No tracks available
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <InstallationClient tracks={tracks} journey={journey} />
    </div>
  );
}
