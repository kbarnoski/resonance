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

    const token = randomUUID().replace(/-/g, "").slice(0, 16);
    const seed = String(randomInt(0, 4294967296));

    // Insert a snapshot of the built-in journey into the journeys table
    const { error } = await supabase.from("journeys").insert({
      user_id: user.id,
      name: journey.name,
      subtitle: journey.subtitle,
      description: journey.description,
      realm_id: journey.realmId,
      phases: journey.phases,
      share_token: token,
      playback_seed: seed,
      ...(resolvedRecordingId ? { recording_id: resolvedRecordingId } : {}),
    });

    if (error) {
      console.error("Share built-in error:", error);
      return Response.json({ error: "Failed to share journey" }, { status: 500 });
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
