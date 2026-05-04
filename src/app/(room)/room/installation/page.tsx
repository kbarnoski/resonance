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

    // Fallback pool — strictly the current user's recordings. The
    // installation kiosk should never play someone else's track (even
    // if RLS would allow cross-user reads of is_featured rows).
    let featuredRecordings: { id: string; title: string; artist: string | null; duration: number | null }[] = [];
    {
      const { data: userRecs } = await supabase
        .from("recordings")
        .select("id, title, artist, duration, is_featured")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (userRecs) {
        // Prefer featured ones at the front (intentional curation),
        // then non-featured fill the rest.
        type Row = { id: string; title: string; artist: string | null; duration: number | null; is_featured: boolean | null };
        const rows = userRecs as Row[];
        const featured = rows.filter((r) => r.is_featured);
        const rest = rows.filter((r) => !r.is_featured);
        featuredRecordings = [...featured, ...rest].map(({ id, title, artist, duration }) => ({ id, title, artist, duration }));
      }
    }

    // Resolve PAIRED_TRACKS values → recording rows. Two value formats:
    //   "%pattern%"  — SQL ILIKE pattern; first matching title wins
    //   "=Exact"     — exact title match; avoids collisions like
    //                  "17th St 63" vs "17th St 63 spectre"
    // Restricted to the current user's recordings — installation pairings
    // never play someone else's track.
    //
    // Exact matches are queried separately because PostgREST OR-filter
    // values with spaces are fiddly to encode reliably (URL encoding
    // breaks it; quoting requires careful escaping). Two queries is
    // simpler and more robust than one OR with mixed types.
    const pairedPatterns = Object.entries(PAIRED_TRACKS);
    const pairedRecordingByJourneyId: Record<string, typeof featuredRecordings[number]> = {};

    const ilikePatterns = pairedPatterns.filter(([, p]) => !p.startsWith("="));
    const exactPatterns = pairedPatterns.filter(([, p]) => p.startsWith("="));

    // ILIKE patterns — single OR query
    if (ilikePatterns.length > 0) {
      const orFilter = ilikePatterns.map(([, p]) => `title.ilike.${p}`).join(",");
      const { data: ilikeRows } = await supabase
        .from("recordings")
        .select("id, title, artist, duration")
        .eq("user_id", authUser.id)
        .or(orFilter);
      if (ilikeRows) {
        for (const [jid, p] of ilikePatterns) {
          const needle = p.replace(/^%|%$/g, "").toLowerCase();
          const hit = (ilikeRows as typeof featuredRecordings).find((r) =>
            (r.title ?? "").toLowerCase().includes(needle),
          );
          if (hit) pairedRecordingByJourneyId[jid] = hit;
        }
      }
    }

    // Exact matches — one query each (simple .eq, no OR-encoding issues)
    for (const [jid, p] of exactPatterns) {
      const exactTitle = p.slice(1);
      const { data: row } = await supabase
        .from("recordings")
        .select("id, title, artist, duration")
        .eq("user_id", authUser.id)
        .eq("title", exactTitle)
        .maybeSingle();
      if (row) pairedRecordingByJourneyId[jid] = row as typeof featuredRecordings[number];
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

    // Pre-fetch cue markers for every paired track in the sequence.
    // The journey-engine uses these to fire bass_hit events that drive
    // Ghost's bass flash overlay (and any future per-cue effects). Without
    // this, ghost's iconic flashes never trigger in installation mode.
    const trackedRecordingIds = sequence
      .map((s) => s.track?.id)
      .filter((id): id is string => !!id);
    const cuesByRecordingId: Record<string, Array<{ time: number; label: string }>> = {};
    if (trackedRecordingIds.length > 0) {
      const { data: markerRows } = await supabase
        .from("markers")
        .select("recording_id, time, label")
        .in("recording_id", trackedRecordingIds)
        .eq("type", "cue")
        .order("time");
      for (const m of (markerRows ?? []) as Array<{ recording_id: string; time: number; label: string }>) {
        if (!cuesByRecordingId[m.recording_id]) cuesByRecordingId[m.recording_id] = [];
        cuesByRecordingId[m.recording_id].push({ time: m.time, label: m.label });
      }
    }

    // Attach cues to each sequence entry so the loop client can apply
    // them to the journey-engine when each journey starts.
    const sequenceWithCues = sequence.map((entry) => ({
      ...entry,
      cues: entry.track ? (cuesByRecordingId[entry.track.id] ?? []) : [],
    }));

    const fallbackTracks = featuredRecordings.map(toTrack);

    return (
      <div className="h-screen w-screen overflow-hidden bg-black">
        {/* Preload Cormorant Garamond — used by both the cycle intro
            ("Resonance") and every journey title. Without this preload
            the cycle title initially rendered in Georgia (system
            fallback) and re-rendered in Cormorant once the font lazy-
            loaded from another component, producing a visible "type
            style change" right as journey 0 started. Loading at the
            page level guarantees the font is on its way before any
            cycle text paints. */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&display=swap"
        />
        <InstallationLoopClient sequence={sequenceWithCues} fallbackTracks={fallbackTracks} debug={isDebug} />
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
