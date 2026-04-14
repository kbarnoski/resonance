import { createClient } from "@/lib/supabase/server";
import { buildJourneyFromStory } from "@/lib/journeys/journey-builder";
import type { AnalysisResult } from "@/lib/audio/types";

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

    const { storyText, realmId, recordingId, name, audioReactive, localImageUrls } = await request.json();
    const safeLocalImageUrls: string[] | null =
      Array.isArray(localImageUrls) && localImageUrls.length > 0
        ? localImageUrls.filter((u: unknown): u is string => typeof u === "string" && u.length > 0)
        : null;

    if (!storyText) {
      return Response.json({ error: "Missing storyText" }, { status: 400 });
    }

    // Fetch analysis if a recording is specified
    let analysis: AnalysisResult | null = null;
    if (recordingId) {
      const { data: analysisRow } = await supabase
        .from("analyses")
        .select("*")
        .eq("recording_id", recordingId)
        .eq("status", "completed")
        .single();
      if (analysisRow) {
        analysis = analysisRow as AnalysisResult;
      }
    }

    // Build journey from story using AI — realmId is optional now
    const journey = await buildJourneyFromStory(storyText, realmId || undefined, analysis);

    // Store in database
    const { data, error } = await supabase.from("journeys").insert({
      user_id: user.id,
      recording_id: recordingId || null,
      name: name || journey.name,
      subtitle: journey.subtitle,
      description: journey.description,
      story_text: storyText,
      realm_id: journey.realmId,
      phases: JSON.parse(JSON.stringify(journey.phases)),
      theme: journey.theme ? JSON.parse(JSON.stringify(journey.theme)) : null,
      audio_reactive: audioReactive ?? false,
      creator_name: creatorName,
      local_image_urls: safeLocalImageUrls,
    }).select().single();

    if (error) {
      console.error("Failed to save journey:", error);
      return Response.json(
        { error: `Failed to save journey: ${error.message} (${error.code})` },
        { status: 500 }
      );
    }

    return Response.json({
      journey: { ...journey, id: data.id, localImageUrls: safeLocalImageUrls ?? undefined },
      dbRecord: data,
    });
  } catch (error) {
    console.error("Journey creation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Failed to create journey: ${message}` }, { status: 500 });
  }
}
