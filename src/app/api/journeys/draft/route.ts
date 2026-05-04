import { createClient } from "@/lib/supabase/server";
import { buildJourneyFromStory } from "@/lib/journeys/journey-builder";
import type { AnalysisResult } from "@/lib/audio/types";
import { logger } from "@/lib/logger";

/**
 * Journey-creation step 1: generate an editable draft from a story.
 *
 * Same AI work as /api/journeys/create but NO DB insert — the client
 * gets the generated journey back, shows the fields for the user to
 * tune, and then posts the edited draft to /api/journeys/create for
 * the actual commit. This is the "describe → generate → refine → save"
 * flow that replaces the old static-fields creation.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyText, realmId, recordingId } = await request.json();
    if (!storyText || typeof storyText !== "string" || !storyText.trim()) {
      return Response.json({ error: "Missing storyText" }, { status: 400 });
    }

    let analysis: AnalysisResult | null = null;
    if (recordingId && typeof recordingId === "string") {
      const { data: analysisRow } = await supabase
        .from("analyses")
        .select("*")
        .eq("recording_id", recordingId)
        .eq("status", "completed")
        .single();
      if (analysisRow) analysis = analysisRow as AnalysisResult;
    }

    const journey = await buildJourneyFromStory(
      storyText.trim(),
      realmId || undefined,
      analysis,
    );

    return Response.json({ journey });
  } catch (error) {
    logger.error("journeys/draft", "error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: `Failed to generate draft: ${message}` },
      { status: 500 },
    );
  }
}
