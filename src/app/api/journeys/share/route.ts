import { createClient } from "@/lib/supabase/server";
import { randomUUID, randomInt } from "crypto";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId } = await request.json();
    if (!journeyId) {
      return Response.json({ error: "Missing journeyId" }, { status: 400 });
    }

    // Check ownership
    const { data: journey } = await supabase
      .from("journeys")
      .select("id, share_token, playback_seed, recording_id")
      .eq("id", journeyId)
      .eq("user_id", user.id)
      .single();

    if (!journey) {
      return Response.json({ error: "Journey not found" }, { status: 404 });
    }

    // Return existing token (backfill seed if missing) or generate new one
    if (journey.share_token) {
      if (!journey.playback_seed) {
        const seed = String(randomInt(0, 4294967296));
        await supabase
          .from("journeys")
          .update({ playback_seed: seed })
          .eq("id", journeyId);
      }
      return Response.json({ token: journey.share_token });
    }

    const token = randomUUID().replace(/-/g, "");
    const seed = String(randomInt(0, 4294967296));

    const { error } = await supabase
      .from("journeys")
      .update({ share_token: token, playback_seed: seed })
      .eq("id", journeyId);

    if (error) {
      return Response.json({ error: "Failed to generate share token" }, { status: 500 });
    }

    // Mark the recording as shared so anonymous users can access audio via RLS
    if (journey.recording_id) {
      const recToken = randomUUID().replace(/-/g, "");
      await supabase
        .from("recordings")
        .update({ share_token: recToken })
        .eq("id", journey.recording_id)
        .is("share_token", null);
    }

    return Response.json({ token });
  } catch (error) {
    console.error("Journey share error:", error);
    return Response.json({ error: "Failed to share journey" }, { status: 500 });
  }
}
