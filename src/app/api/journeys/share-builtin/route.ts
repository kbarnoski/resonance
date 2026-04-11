import { createClient } from "@/lib/supabase/server";
import { randomUUID, randomInt } from "crypto";
import { getJourney } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch display name for credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const creatorName = profile?.display_name ?? null;

    const { journeyId, recordingId } = await request.json();
    if (!journeyId) {
      return Response.json({ error: "Missing journeyId" }, { status: 400 });
    }

    // Look up built-in journey definition
    const journey = getJourney(journeyId);
    if (!journey) {
      return Response.json({ error: "Journey not found" }, { status: 404 });
    }

    // Resolve recording: prefer paired track, then client-provided recordingId
    let resolvedRecordingId = recordingId ?? null;
    const pairedSearch = PAIRED_TRACKS[journeyId];
    if (pairedSearch) {
      const { data, error: searchErr } = await supabase
        .from("recordings")
        .select("id, title")
        .ilike("title", pairedSearch)
        .limit(1);
      console.log("[share-builtin] paired track search:", pairedSearch, "→", data, searchErr);
      if (data?.[0]) {
        resolvedRecordingId = data[0].id;
      }
    }
    console.log("[share-builtin] resolvedRecordingId:", resolvedRecordingId);

    // Reuse existing share row if this user already shared this built-in journey
    const { data: existing } = await supabase
      .from("journeys")
      .select("share_token")
      .eq("user_id", user.id)
      .eq("theme->>builtinJourneyId", journeyId)
      .not("share_token", "is", null)
      .limit(1)
      .single();

    let token: string;

    if (existing?.share_token) {
      token = existing.share_token;
    } else {
      token = randomUUID().replace(/-/g, "").slice(0, 16);
      const seed = String(randomInt(0, 4294967296));

      // Insert a reference to the built-in journey (live link — always uses latest definition).
      // Snapshot of phases/name stored as fallback if the built-in is ever removed from code.
      const { error } = await supabase.from("journeys").insert({
        user_id: user.id,
        name: journey.name,
        subtitle: journey.subtitle,
        description: journey.description,
        realm_id: journey.realmId,
        phases: journey.phases,
        share_token: token,
        playback_seed: seed,
        theme: { builtinJourneyId: journeyId },
        creator_name: creatorName,
        ...(resolvedRecordingId ? { recording_id: resolvedRecordingId } : {}),
      });

      if (error) {
        console.error("Share built-in error:", error);
        return Response.json({ error: "Failed to share journey" }, { status: 500 });
      }
    }

    // Mark the recording as shared so anonymous users can access audio via RLS
    if (resolvedRecordingId) {
      const recToken = randomUUID().replace(/-/g, "").slice(0, 16);
      await supabase
        .from("recordings")
        .update({ share_token: recToken })
        .eq("id", resolvedRecordingId)
        .is("share_token", null);
    }

    return Response.json({ token });
  } catch (error) {
    console.error("Share built-in error:", error);
    return Response.json({ error: "Failed to share journey" }, { status: 500 });
  }
}
