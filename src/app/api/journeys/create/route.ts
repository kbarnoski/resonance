import { createClient } from "@/lib/supabase/server";
import { buildJourneyFromStory } from "@/lib/journeys/journey-builder";
import type { AnalysisResult } from "@/lib/audio/types";
import type { Journey } from "@/lib/journeys/types";
import { logger } from "@/lib/logger";

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

    const {
      storyText,
      realmId,
      recordingId,
      name,
      audioReactive,
      aiEnabled,
      localImageUrls,
      draft,
    } = await request.json();
    // Default true; the toggle in the create form lets users opt out for
    // shader-only (viz-only) journeys.
    const aiEnabledFlag: boolean = aiEnabled === false ? false : true;
    const safeLocalImageUrls: string[] | null =
      Array.isArray(localImageUrls) && localImageUrls.length > 0
        ? localImageUrls.filter((u: unknown): u is string => typeof u === "string" && u.length > 0)
        : null;

    // Two-path flow:
    //   (a) legacy / auto-generate: client sends storyText only → AI builds
    //       the journey here and we save it in the same request.
    //   (b) describe → refine → save: client sends a pre-built draft
    //       (returned earlier from /api/journeys/draft, possibly edited
    //       by the user) → we skip the AI call and just persist.
    let journey: Journey;

    if (draft && typeof draft === "object") {
      // Minimal shape validation — the draft came from our own /draft
      // endpoint, so we trust its structure but sanity-check the fields
      // we're about to commit.
      if (
        typeof draft.name !== "string" ||
        typeof draft.subtitle !== "string" ||
        typeof draft.description !== "string" ||
        !Array.isArray(draft.phases) ||
        draft.phases.length !== 6
      ) {
        return Response.json({ error: "Invalid draft shape" }, { status: 400 });
      }
      journey = draft as Journey;
    } else {
      if (!storyText) {
        return Response.json({ error: "Missing storyText" }, { status: 400 });
      }
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
      journey = await buildJourneyFromStory(
        storyText,
        realmId || undefined,
        analysis,
      );
    }

    // Store in database
    const { data, error } = await supabase.from("journeys").insert({
      user_id: user.id,
      recording_id: recordingId || null,
      name: name || journey.name,
      subtitle: journey.subtitle,
      description: journey.description,
      story_text: storyText ?? null,
      realm_id: journey.realmId,
      phases: JSON.parse(JSON.stringify(journey.phases)),
      theme: journey.theme ? JSON.parse(JSON.stringify(journey.theme)) : null,
      audio_reactive: audioReactive ?? false,
      ai_enabled: aiEnabledFlag,
      creator_name: creatorName,
      local_image_urls: safeLocalImageUrls,
    }).select().single();

    if (error) {
      logger.error("journeys/create", "Failed to save:", error);
      return Response.json(
        { error: `Failed to save journey: ${error.message} (${error.code})` },
        { status: 500 }
      );
    }

    return Response.json({
      journey: {
        ...journey,
        id: data.id,
        aiEnabled: aiEnabledFlag,
        localImageUrls: safeLocalImageUrls ?? undefined,
      },
      dbRecord: data,
    });
  } catch (error) {
    logger.error("journeys/create", "error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Failed to create journey: ${message}` }, { status: 500 });
  }
}
